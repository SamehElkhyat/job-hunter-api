import type {
  AnalyzeRequest,
  AnswersRequest,
  CoverLetterRequest,
  CriticalGap,
  DraftAnswer,
  KeywordImportance,
  MatchAnalysis,
  MissingKeyword,
  Recommendation,
  ScoreCategory,
  SeniorityLevel,
} from "@shared/types/ai";
import { computeOverallScore, verdictFor, VERDICT_COPY } from "@shared/lib/ai/scoring";
import {
  cvMentionsSkill,
  detectCompanyTone,
  detectDomains,
  detectSeniority,
  estimateYearsFromCv,
  explicitYearsForSkill,
  extractRequirementBullets,
  findSkillByQuery,
  guessJobTitle,
  guessNameFromCv,
  lowerFirst,
  pickResponsibility,
  quantifiedLineRatio,
  rankCvEvidence,
  requiredYearsFromJd,
  scanJobDescription,
  SENIORITY_RANK,
  seniorityFromYears,
  skillsInText,
  stripTrailingPunctuation,
  type JdSkill,
} from "@shared/lib/ai/text-utils";
import { clamp, uid } from "@shared/lib/utils";

/**
 * Deterministic, dependency-free analysis engine. It powers the app when no Anthropic API key is
 * configured and acts as the safety net whenever a Claude call fails or is declined.
 */

const IMPORTANCE_WEIGHT: Record<KeywordImportance, number> = { critical: 3, important: 2, nice: 1 };
const IMPORTANCE_ORDER: Record<KeywordImportance, number> = { critical: 0, important: 1, nice: 2 };

function categoryScore(
  jdSkills: JdSkill[],
  cvSkills: Set<string>,
  emptySummary: string,
  label: string,
): ScoreCategory {
  if (!jdSkills.length) {
    return { score: 70, summary: emptySummary, matched: [], missing: [] };
  }
  let total = 0;
  let hit = 0;
  const matched: JdSkill[] = [];
  const missing: JdSkill[] = [];
  for (const s of jdSkills) {
    const w = IMPORTANCE_WEIGHT[s.importance];
    total += w;
    if (cvSkills.has(s.name)) {
      hit += w;
      matched.push(s);
    } else missing.push(s);
  }
  const ratio = hit / total;
  const score = Math.round(clamp(ratio * 100, 0, 100));
  const byImportance = (a: JdSkill, b: JdSkill) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
  matched.sort(byImportance);
  missing.sort(byImportance);
  const criticalMissing = missing.filter((m) => m.importance === "critical");
  const summary = missing.length
    ? `${matched.length} of ${jdSkills.length} ${label} from the posting are evidenced in your CV${
        criticalMissing.length
          ? `; critical gaps: ${criticalMissing.slice(0, 3).map((m) => m.name).join(", ")}.`
          : "; none of the gaps are critical."
      }`
    : `Every ${label.replace(/s$/, "")} the posting asks for appears in your CV.`;
  return {
    score,
    summary,
    matched: matched.slice(0, 12).map((m) => m.name),
    missing: missing.slice(0, 12).map((m) => m.name),
  };
}

function softCategory(jdSkills: JdSkill[], cvSkills: Set<string>, cv: string): ScoreCategory {
  const base = categoryScore(jdSkills, cvSkills, "The posting does not stress specific soft skills, so this is scored neutrally.", "soft skills");
  if (!jdSkills.length) return base;
  // CVs rarely name soft skills outright, so give credit for any general evidence of teamwork/impact.
  const generalEvidence = skillsInText(cv, "soft").size;
  const floor = clamp(35 + generalEvidence * 8, 35, 70);
  return { ...base, score: Math.max(base.score, floor) };
}

function experienceCategory(
  jdText: string,
  cv: string,
  titleHint: string,
): { category: ScoreCategory; requiredYears: number | null; cvYears: number; seniority: SeniorityLevel } {
  const requiredYears = requiredYearsFromJd(jdText);
  const cvYears = estimateYearsFromCv(cv);
  const jdSeniority = detectSeniority(`${titleHint}\n${jdText.slice(0, 400)}`);
  const cvSeniority = seniorityFromYears(cvYears);

  let yearsScore = 75;
  if (requiredYears !== null && cvYears > 0) {
    const ratio = cvYears / requiredYears;
    yearsScore = ratio >= 1 ? Math.min(100, 90 + (cvYears - requiredYears) * 2) : Math.max(15, ratio * 92);
  } else if (requiredYears !== null && cvYears === 0) {
    yearsScore = 40;
  }

  let seniorityScore = 80;
  if (jdSeniority !== "unspecified") {
    const gap = SENIORITY_RANK[jdSeniority] - SENIORITY_RANK[cvSeniority];
    seniorityScore = gap <= 0 ? 95 : Math.max(25, 90 - gap * 28);
  }

  const jdDomains = detectDomains(jdText);
  const cvDomains = detectDomains(cv);
  const sharedDomains = [...jdDomains].filter((d) => cvDomains.has(d));
  const domainScore = jdDomains.size ? 45 + (sharedDomains.length / jdDomains.size) * 55 : 75;

  const impact = quantifiedLineRatio(cv);
  const impactScore = 45 + impact * 55;

  const score = Math.round(clamp(yearsScore * 0.4 + seniorityScore * 0.25 + domainScore * 0.15 + impactScore * 0.2, 0, 100));

  const parts: string[] = [];
  if (requiredYears !== null) {
    parts.push(
      cvYears
        ? `Posting asks for ${requiredYears}+ years; your CV shows about ${cvYears.toFixed(cvYears % 1 ? 1 : 0)}.`
        : `Posting asks for ${requiredYears}+ years but your CV does not make your total experience clear.`,
    );
  } else {
    parts.push("The posting does not state a number of years.");
  }
  if (jdSeniority !== "unspecified") parts.push(`Role level reads as ${jdSeniority}; your profile reads as ${cvSeniority}.`);
  if (jdDomains.size) parts.push(sharedDomains.length ? `Domain overlap: ${sharedDomains.join(", ")}.` : `No evidence of ${[...jdDomains].slice(0, 2).join(" / ")} domain experience.`);

  return {
    category: {
      score,
      summary: parts.join(" "),
      matched: sharedDomains,
      missing: [...jdDomains].filter((d) => !cvDomains.has(d)),
    },
    requiredYears,
    cvYears,
    seniority: jdSeniority,
  };
}

function missingKeywordSuggestion(skill: JdSkill): string {
  switch (skill.category) {
    case "tool":
      return `If you have used ${skill.name}, name it in your Skills section and in the bullet of the project where it was used.`;
    case "soft":
      return `Show ${skill.name.toLowerCase()} through a concrete bullet (who you worked with, what changed) rather than listing it.`;
    default:
      return `If you have hands-on ${skill.name} experience, add it to Skills and to the most relevant role bullet with the outcome it produced.`;
  }
}

export function analyzeLocal(req: AnalyzeRequest): MatchAnalysis {
  const { cvText, job } = req;
  const jdText = job.description;
  const title = job.title.trim() || guessJobTitle(jdText);
  const jdSkills = scanJobDescription(`${title}\n${jdText}`);
  const cvSkills = skillsInText(cvText);

  const hardJd = jdSkills.filter((s) => s.category === "hard");
  const toolJd = jdSkills.filter((s) => s.category === "tool");
  const softJd = jdSkills.filter((s) => s.category === "soft");

  const hardSkills = categoryScore(hardJd, cvSkills, "No specific technical skills were detected in the posting.", "technical skills");
  const tools = categoryScore(toolJd, cvSkills, "No specific tools or platforms were detected in the posting.", "tools");
  const softSkills = softCategory(softJd, cvSkills, cvText);
  const exp = experienceCategory(jdText, cvText, title);

  const breakdown = { hardSkills, tools, softSkills, experience: exp.category };
  const overallScore = computeOverallScore(breakdown);
  const verdict = verdictFor(overallScore);

  const matchedAll = jdSkills
    .filter((s) => cvSkills.has(s.name) && s.category !== "soft")
    .sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] || b.mentions - a.mentions);
  const missingAll = jdSkills
    .filter((s) => !cvSkills.has(s.name))
    .sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] || b.mentions - a.mentions);

  const missingKeywords: MissingKeyword[] = missingAll.slice(0, 15).map((s) => ({
    keyword: s.name,
    importance: s.importance,
    suggestion: missingKeywordSuggestion(s),
  }));

  const gaps: CriticalGap[] = [];
  const criticalMissing = missingAll.filter((s) => s.importance === "critical" && s.category !== "soft");
  for (const s of criticalMissing.slice(0, 3)) {
    gaps.push({
      title: `No evidence of ${s.name}`,
      severity: "critical",
      detail: `${s.name} is a core requirement (mentioned ${s.mentions}×) but nothing in your CV demonstrates it. ATS filters commonly reject on a missing must-have.`,
    });
  }
  if (exp.requiredYears !== null && exp.cvYears > 0 && exp.cvYears < exp.requiredYears) {
    gaps.push({
      title: `Experience shortfall: ${exp.requiredYears - Math.round(exp.cvYears)} yr${exp.requiredYears - Math.round(exp.cvYears) === 1 ? "" : "s"} under the ask`,
      severity: exp.cvYears / exp.requiredYears < 0.7 ? "critical" : "moderate",
      detail: `The posting wants ${exp.requiredYears}+ years. Make the depth and scope of your roles obvious so recruiters see seniority beyond the raw number.`,
    });
  }
  if (exp.requiredYears !== null && exp.cvYears === 0) {
    gaps.push({
      title: "Total experience is not stated",
      severity: "moderate",
      detail: "Your CV has no parsable date ranges or '× years' statement. Add dates to every role and a one-line summary with total years.",
    });
  }
  const quantified = quantifiedLineRatio(cvText);
  if (quantified < 0.35) {
    gaps.push({
      title: "Few quantified achievements",
      severity: "moderate",
      detail: `Only ${Math.round(quantified * 100)}% of your bullets contain a number. Hiring managers scan for scale, speed and money impact.`,
    });
  }
  const importantMissing = missingAll.filter((s) => s.importance === "important" && s.category !== "soft");
  if (importantMissing.length >= 3) {
    gaps.push({
      title: `${importantMissing.length} responsibility-level skills missing`,
      severity: "minor",
      detail: `The responsibilities section mentions ${importantMissing.slice(0, 4).map((s) => s.name).join(", ")} which your CV never references.`,
    });
  }

  const recommendations: Recommendation[] = [];
  if (criticalMissing.length) {
    recommendations.push({
      title: `Surface ${criticalMissing.slice(0, 3).map((s) => s.name).join(", ")} in your Skills section`,
      detail: `These are must-haves in the posting. If you have used them, add them to Skills and to at least one experience bullet each so both the ATS and a human see the evidence.`,
      impact: "high",
      section: "skills",
    });
  }
  recommendations.push({
    title: "Mirror the job title in your headline",
    detail: `Use a headline such as "${title}" (or the closest honest equivalent) so title-matching ATS rules score you higher.`,
    impact: "high",
    section: "headline",
  });
  if (quantified < 0.6) {
    recommendations.push({
      title: "Add numbers to your top three bullets",
      detail: "Rewrite as 'Action + system + measurable result', e.g. 'Cut p95 API latency from 900ms to 240ms by introducing Redis caching'. Only use figures you can defend.",
      impact: "high",
      section: "experience",
    });
  }
  const topMatched = matchedAll.slice(0, 4).map((s) => s.name);
  recommendations.push({
    title: "Tailor a 3-line summary to this role",
    detail: topMatched.length
      ? `Open your CV with a summary that leads with ${topMatched.join(", ")}, since those are what this posting values most and you can already evidence them.`
      : "Open your CV with a three-line summary that names the role, your years of experience and your strongest relevant stack.",
    impact: "medium",
    section: "summary",
  });
  if (importantMissing.length) {
    recommendations.push({
      title: `Cover ${importantMissing.slice(0, 3).map((s) => s.name).join(", ")} where truthful`,
      detail: "These appear in the responsibilities. Add a project or bullet if you have relevant exposure, even from side projects or open source.",
      impact: "medium",
      section: "projects",
    });
  }
  if (softSkills.score < 60 && softJd.length) {
    recommendations.push({
      title: "Show collaboration and ownership through stories",
      detail: `The posting stresses ${softJd.slice(0, 3).map((s) => s.name.toLowerCase()).join(", ")}. Add bullets describing who you worked with, what you owned and what changed because of it.`,
      impact: "medium",
      section: "experience",
    });
  }
  recommendations.push({
    title: "Keep the matched keywords, in the posting's wording",
    detail: `ATS parsers match literal strings. Use the posting's exact spelling for keywords you already have (${matchedAll.slice(0, 5).map((s) => s.name).join(", ") || "n/a"}).`,
    impact: "low",
    section: "skills",
  });

  const headline =
    verdict === "excellent"
      ? `Your CV covers nearly everything ${job.company || "this employer"} asks for.`
      : verdict === "strong"
        ? `Solid fit: ${matchedAll.length} of ${jdSkills.length - softJd.length} technical requirements already evidenced.`
        : verdict === "moderate"
          ? `Partial fit: ${criticalMissing.length ? `${criticalMissing.length} critical requirement${criticalMissing.length > 1 ? "s" : ""} missing` : "gaps in secondary requirements"}.`
          : "Low overlap with the stated requirements; strengthen the CV before applying.";

  return {
    overallScore,
    verdict,
    headline: `${headline} ${VERDICT_COPY[verdict].advice}`,
    breakdown,
    matchedKeywords: matchedAll.slice(0, 20).map((s) => s.name),
    missingKeywords,
    gaps: gaps.slice(0, 6),
    recommendations: recommendations.slice(0, 8),
    job: {
      title,
      company: job.company.trim(),
      seniority: exp.seniority,
      requiredYears: exp.requiredYears,
      tone: detectCompanyTone(jdText),
      mustHaves: extractRequirementBullets(jdText, 5),
    },
    engine: "local",
    generatedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Cover letter                                                                */
/* -------------------------------------------------------------------------- */

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function generateCoverLetterLocal(req: CoverLetterRequest): string {
  const { cvText, job, tone, analysis, instructions } = req;
  const local = analysis ?? analyzeLocal({ cvText, job });
  const name = req.candidateName.trim() || guessNameFromCv(cvText);
  const role = job.title.trim() || local.job.title || "the role";
  const company = job.company.trim() || local.job.company;
  const companyRef = company || "your team";
  const topSkills = local.matchedKeywords.slice(0, 4);
  const evidence = rankCvEvidence(cvText, local.matchedKeywords, 3);
  const mustHave = pickResponsibility(local.job.mustHaves) ?? "";
  const years = estimateYearsFromCv(cvText);
  const yearsPhrase = years >= 1 ? `${Math.floor(years)} years` : "hands-on experience";
  const proof1 = evidence[0] ? stripTrailingPunctuation(evidence[0].line) : "";
  const proof2 = evidence[1] ? stripTrailingPunctuation(evidence[1].line) : "";
  const extra = instructions.trim() ? `\n\n${stripTrailingPunctuation(instructions.trim())}.` : "";
  const signature = name || "Best regards";
  const stack = joinList(topSkills) || "modern web technology";

  const proofBlock = (lead: string): string => {
    const parts: string[] = [];
    if (proof1) parts.push(`${lead} I ${lowerFirst(proof1)}.`);
    if (proof2) parts.push(`I also ${lowerFirst(proof2)}.`);
    return parts.join(" ");
  };

  switch (tone) {
    case "confident":
      return `Dear Hiring Team,

${role} at ${companyRef} needs someone who has already shipped ${stack} in production. I have, across ${yearsPhrase}.

${proofBlock("Recent proof:") || `I have delivered production systems built on ${stack}.`}

${mustHave ? `You are looking for someone who can ${mustHave}. That is the work I do best, and my track record shows it.` : `The scope you describe is the scope I have owned.`}

I would welcome 20 minutes to walk you through how I would approach the first 90 days.${extra}

${signature === "Best regards" ? "Best regards" : `Best regards,\n${signature}`}`;

    case "startup":
      return `Hi ${company ? `${company} team` : "team"},

I'm applying for ${role}. Short version: I ship ${stack}, and I do it end to end.

${proof1 ? `${sentenceFirst(proof1)}.` : `I've owned features from idea to production.`}${proof2 ? ` ${sentenceFirst(proof2)}.` : ""}

${local.job.tone.toLowerCase().includes("startup") ? "The fast-paced, high-ownership setup you describe is exactly where I do my best work." : "I like small feedback loops and owning outcomes, not tickets."}

Happy to chat whenever suits you.${extra}

${signature === "Best regards" ? "Cheers" : `Cheers,\n${signature}`}`;

    case "technical":
      return `Dear Hiring Team,

The ${role} position at ${companyRef} centres on ${stack}. That is the stack I have spent ${yearsPhrase} building and operating, and I am applying because the engineering problems you describe are the ones I enjoy solving.

${proofBlock("A representative example:") || `I have designed and shipped production services using ${stack}.`}

${mustHave ? `On your requirement to ${mustHave}: I approach this by starting from failure modes and operational cost, then choosing the simplest design that meets them, and documenting the trade-offs so the team can revisit them.` : "I default to simple designs, measurable outcomes and decisions documented well enough that the team can revisit them."}

I would be glad to discuss the architecture behind any of this in more depth.${extra}

${signature === "Best regards" ? "Best regards" : `Best regards,\n${signature}`}`;

    default:
      return `Dear Hiring Team,

I am excited to apply for the ${role} position${company ? ` at ${company}` : ""}. With ${yearsPhrase} of experience working with ${stack}, I believe my background aligns closely with what you are looking for.

${proofBlock("In my recent work,") || `Across my career I have delivered reliable, well-tested software using ${stack}.`}

${mustHave ? `I noted that the role calls for the ability to ${mustHave}. I bring a collaborative, quality-focused approach to exactly this kind of work, and I enjoy partnering with product and design to turn requirements into dependable results.` : "I bring a collaborative, quality-focused approach and enjoy partnering with product and design to turn requirements into dependable results."}

Thank you for your time and consideration. I would welcome the opportunity to discuss how I can contribute to ${companyRef}.${extra}

${signature === "Best regards" ? "Sincerely" : `Sincerely,\n${signature}`}`;
  }
}

function sentenceFirst(line: string): string {
  const s = stripTrailingPunctuation(line);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Recruiter / form questions                                                  */
/* -------------------------------------------------------------------------- */

type AnswerDraft = Omit<DraftAnswer, "id" | "question" | "engine">;

function fact(req: AnswersRequest, key: string): string {
  return (req.profileFacts[key] ?? "").trim();
}

export function answerQuestionLocal(req: AnswersRequest, question: string): AnswerDraft {
  const q = question.toLowerCase();
  const totalYears = fact(req, "yearsExperience") || String(Math.floor(estimateYearsFromCv(req.cvText)) || "");

  // "How many years of experience do you have with X?"
  const yearsMatch = q.match(/(?:years?|yrs?)[^?]*?\b(?:with|in|using|of|on)\s+([a-z0-9.+#/\- ]{2,40}?)\s*[?.]?$/i);
  if (/(?:how many )?years?.*experience|experience.*years?/.test(q) && yearsMatch) {
    const subject = yearsMatch[1].trim();
    const skillName = findSkillByQuery(subject);
    if (skillName) {
      const explicit = explicitYearsForSkill(req.cvText, skillName);
      if (explicit !== null) {
        return { answer: `${explicit} years of hands-on experience with ${skillName}.`, confidence: "high", needsReview: false };
      }
      if (cvMentionsSkill(req.cvText, skillName)) {
        const total = Number(totalYears) || 0;
        const estimate = total ? Math.max(1, Math.round(total * 0.6)) : 1;
        return {
          answer: `Approximately ${estimate} years of hands-on experience with ${skillName}, used across several production projects.`,
          confidence: "medium",
          needsReview: true,
        };
      }
      const related = [...skillsInText(req.cvText, "hard")].slice(0, 2);
      return {
        answer: `I have not used ${skillName} professionally yet. I pick up new tooling quickly and my closest related experience is ${related.length ? joinList(related) : "modern web development"}.`,
        confidence: "low",
        needsReview: true,
      };
    }
    return {
      answer: totalYears ? `I have ${totalYears} years of overall professional software engineering experience.` : "Please add your years of experience in your profile.",
      confidence: totalYears ? "medium" : "low",
      needsReview: true,
    };
  }

  if (/total|overall|professional experience|years of experience/.test(q) && /year/.test(q)) {
    return totalYears
      ? { answer: `${totalYears} years of professional software engineering experience.`, confidence: "high", needsReview: false }
      : { answer: "Please add your years of experience in your profile.", confidence: "low", needsReview: true };
  }

  if (/salary|compensation|pay expectation|expected pay|rate/.test(q)) {
    const salary = fact(req, "expectedSalary");
    const currency = fact(req, "salaryCurrency") || "USD";
    return salary
      ? { answer: `My expectation is ${currency} ${salary} per year, and I'm open to discussing the full package.`, confidence: "high", needsReview: false }
      : { answer: "I'm flexible and would like to understand the scope and total package first; I'm happy to discuss a range once we've talked.", confidence: "low", needsReview: true };
  }

  if (/notice|availab|start date|when can you start|earliest/.test(q)) {
    const notice = fact(req, "noticePeriod");
    return notice
      ? { answer: `My notice period is ${notice}.`, confidence: "high", needsReview: false }
      : { answer: "Please add your notice period in your profile.", confidence: "low", needsReview: true };
  }

  if (/sponsor/.test(q)) {
    const needs = fact(req, "requiresSponsorship");
    return needs
      ? { answer: needs === "yes" ? "Yes, I would require visa sponsorship." : "No, I do not require visa sponsorship.", confidence: "high", needsReview: false }
      : { answer: "Please confirm your sponsorship status.", confidence: "low", needsReview: true };
  }

  if (/authori[sz]ed|authori[sz]ation|right to work|work permit|eligible to work/.test(q)) {
    const auth = fact(req, "workAuthorization");
    return auth
      ? { answer: auth.endsWith(".") ? auth : `${auth}.`, confidence: "high", needsReview: false }
      : { answer: "Please add your work authorisation in your profile.", confidence: "low", needsReview: true };
  }

  if (/relocat/.test(q)) {
    const reloc = fact(req, "willingToRelocate");
    return reloc
      ? { answer: reloc === "yes" ? "Yes, I am open to relocation." : "I am not looking to relocate, but I am happy to work remotely or hybrid.", confidence: "high", needsReview: false }
      : { answer: "Please confirm your relocation preference.", confidence: "low", needsReview: true };
  }

  if (/linkedin/.test(q)) return linkAnswer(fact(req, "linkedin"), "LinkedIn");
  if (/github/.test(q)) return linkAnswer(fact(req, "github"), "GitHub");
  if (/portfolio|website|personal site/.test(q)) return linkAnswer(fact(req, "portfolio"), "portfolio");

  if (/where do you live|location|city|based/.test(q)) {
    const loc = fact(req, "location");
    return loc
      ? { answer: `I'm based in ${loc}.`, confidence: "high", needsReview: false }
      : { answer: "Please add your location in your profile.", confidence: "low", needsReview: true };
  }

  if (/how did you hear|where did you (?:find|hear)|referral|source/.test(q)) {
    const src = fact(req, "referralSource");
    return { answer: src || "I found the role while searching for engineering positions online.", confidence: src ? "high" : "medium", needsReview: !src };
  }

  const analysis = analyzeLocal({ cvText: req.cvText, job: req.job });
  const topSkills = joinList(analysis.matchedKeywords.slice(0, 3)) || "modern web technology";
  const company = req.job.company.trim() || "your company";
  const role = req.job.title.trim() || analysis.job.title;

  if (/why.*(?:us|company|role|position|join|interested|apply|work (?:here|for))/.test(q)) {
    return {
      answer: `The ${role} role at ${company} stands out because it centres on ${topSkills}, which is where I have done my strongest work. ${pickResponsibility(analysis.job.mustHaves) ? `The chance to ${pickResponsibility(analysis.job.mustHaves)} is exactly the kind of problem I want to spend my time on.` : "I want to contribute to a team that cares about quality and shipping."}`,
      confidence: "medium",
      needsReview: true,
    };
  }

  if (/tell (?:us|me) about yourself|introduce yourself|about you|summary/.test(q)) {
    const name = fact(req, "currentTitle");
    return {
      answer: `${name ? `I'm a ${name}` : "I'm a software engineer"}${totalYears ? ` with ${totalYears} years of experience` : ""}, working mainly with ${topSkills}. I like owning features from design through production and keeping the codebase easy for the next person to change.`,
      confidence: "medium",
      needsReview: true,
    };
  }

  if (/strength/.test(q)) {
    return { answer: `My main strength is taking ambiguous product requirements and turning them into reliable, well-tested ${topSkills} features, then following them into production.`, confidence: "medium", needsReview: true };
  }

  return {
    answer: `Please review: I would answer this by connecting my experience with ${topSkills} to what ${company} needs for the ${role} role.`,
    confidence: "low",
    needsReview: true,
  };
}

function linkAnswer(url: string, label: string): AnswerDraft {
  return url
    ? { answer: url, confidence: "high", needsReview: false }
    : { answer: `Please add your ${label} URL in your profile.`, confidence: "low", needsReview: true };
}

export function answerQuestionsLocal(req: AnswersRequest): DraftAnswer[] {
  return req.questions.map((question) => ({
    id: uid("ans"),
    question,
    engine: "local" as const,
    ...answerQuestionLocal(req, question),
  }));
}
