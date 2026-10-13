import {
  CRITICAL_SECTION_RE,
  DOMAINS,
  IGNORE_SECTION_RE,
  NICE_SECTION_RE,
  RESPONSIBILITY_SECTION_RE,
  SKILLS,
  type SkillCategory,
  type SkillDef,
} from "@shared/lib/ai/taxonomy";
import type { KeywordImportance, SeniorityLevel } from "@shared/types/ai";

/* -------------------------------------------------------------------------- */
/* Skill matching                                                              */
/* -------------------------------------------------------------------------- */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function aliasPattern(alias: string): string {
  const stem = alias.endsWith("*");
  const body = escapeRegex(stem ? alias.slice(0, -1) : alias);
  return `(?<![A-Za-z0-9])${body}${stem ? "[A-Za-z]*" : "(?![A-Za-z0-9])"}`;
}

interface CompiledSkill {
  def: SkillDef;
  regexes: RegExp[];
}

let compiled: CompiledSkill[] | null = null;

function getCompiled(): CompiledSkill[] {
  if (compiled) return compiled;
  compiled = SKILLS.map((def) => {
    const regexes: RegExp[] = [];
    // A skill with neither alias list is matched by its canonical name.
    const aliases = def.aliases?.length || def.caseSensitive?.length ? (def.aliases ?? []) : [def.name];
    if (aliases.length) {
      regexes.push(new RegExp(aliases.map(aliasPattern).join("|"), "i"));
    }
    if (def.caseSensitive?.length) {
      regexes.push(new RegExp(def.caseSensitive.map(aliasPattern).join("|")));
    }
    return { def, regexes };
  });
  return compiled;
}

export function lineHasSkill(line: string, skill: CompiledSkill): boolean {
  return skill.regexes.some((re) => re.test(line));
}

export function skillsInText(text: string, category?: SkillCategory): Set<string> {
  const found = new Set<string>();
  for (const skill of getCompiled()) {
    if (category && skill.def.category !== category) continue;
    if (skill.regexes.some((re) => re.test(text))) found.add(skill.def.name);
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* Job-description scanning                                                    */
/* -------------------------------------------------------------------------- */

export interface JdSkill {
  name: string;
  category: SkillCategory;
  importance: KeywordImportance;
  mentions: number;
}

const INLINE_NICE_RE = /\b(?:nice[- ]to[- ]have|a plus|bonus|preferred|is a plus|are a plus|advantage|desirable|ideally|familiarity with)\b/i;
const INLINE_MUST_RE = /\b(?:must|required|requires?|proficien\w+|strong|expert\w*|deep|solid|extensive|hands-on|minimum)\b/i;

type Section = "critical" | "important" | "nice" | "ignore";

/** A short line that looks like a section heading (colon, markdown #, known section name or a bare Title Case label). */
function isHeadingLine(line: string): boolean {
  if (line.length >= 70 || /^[-•*·▪●\d]/.test(line)) return false;
  if (/[:：]$|^#+\s/.test(line)) return true;
  if (
    CRITICAL_SECTION_RE.test(line) ||
    NICE_SECTION_RE.test(line) ||
    RESPONSIBILITY_SECTION_RE.test(line) ||
    IGNORE_SECTION_RE.test(line)
  ) {
    return true;
  }
  return /^[A-Z][A-Za-z &/'’-]{2,50}$/.test(line);
}

export function scanJobDescription(text: string): JdSkill[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let section: Section = "important";
  const rank: Record<KeywordImportance, number> = { critical: 3, important: 2, nice: 1 };
  const result = new Map<string, JdSkill>();
  const skills = getCompiled();

  for (const line of lines) {
    const isHeading = isHeadingLine(line);
    if (isHeading) {
      if (IGNORE_SECTION_RE.test(line)) section = "ignore";
      else if (NICE_SECTION_RE.test(line)) section = "nice";
      else if (CRITICAL_SECTION_RE.test(line)) section = "critical";
      else if (RESPONSIBILITY_SECTION_RE.test(line)) section = "important";
      // Plain headings that match nothing keep the current section.
    } else if (NICE_SECTION_RE.test(line) && line.length < 100 && /[:：]/.test(line)) {
      section = "nice";
    }
    if (section === "ignore" && !isHeading) {
      continue;
    }

    for (const skill of skills) {
      if (!lineHasSkill(line, skill)) continue;
      let importance: KeywordImportance =
        section === "critical" ? "critical" : section === "nice" ? "nice" : "important";
      if (INLINE_NICE_RE.test(line)) importance = "nice";
      else if (importance === "important" && INLINE_MUST_RE.test(line)) importance = "critical";

      const existing = result.get(skill.def.name);
      if (!existing) {
        result.set(skill.def.name, {
          name: skill.def.name,
          category: skill.def.category,
          importance,
          mentions: 1,
        });
      } else {
        existing.mentions += 1;
        if (rank[importance] > rank[existing.importance]) existing.importance = importance;
      }
    }
  }

  for (const entry of result.values()) {
    if (entry.mentions >= 3 && entry.importance === "important") entry.importance = "critical";
  }
  return [...result.values()];
}

export function extractRequirementBullets(text: string, limit = 5): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const bullets: string[] = [];
  let inCritical = false;
  for (const line of lines) {
    if (!line) continue;
    if (isHeadingLine(line)) {
      inCritical = CRITICAL_SECTION_RE.test(line) || RESPONSIBILITY_SECTION_RE.test(line);
      continue;
    }
    if (inCritical && /^[-•*·▪●\d.)]+\s+/.test(line)) {
      const cleaned = line.replace(/^[-•*·▪●\d.)]+\s+/, "").trim();
      bullets.push(cleaned.length > 150 ? `${cleaned.slice(0, 147).trimEnd()}…` : cleaned);
      if (bullets.length >= limit) break;
    }
  }
  if (bullets.length) return bullets;
  // Fallback: the longest sentences that contain a known skill.
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .map((s) => s.replace(/^[-•*·▪●\d.)]+\s+/, ""))
    .filter((s) => s.length > 30 && skillsInText(s).size > 0)
    .slice(0, limit)
    .map((s) => (s.length > 150 ? `${s.slice(0, 147).trimEnd()}…` : s));
}

/* -------------------------------------------------------------------------- */
/* Experience estimation                                                       */
/* -------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Highest "N+ years" figure in the JD, or null when none is stated. */
export function requiredYearsFromJd(text: string): number | null {
  const matches = [...text.matchAll(/(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:years?|yrs?)\b/gi)];
  const values = matches.map((m) => Number(m[1])).filter((n) => n > 0 && n <= 25);
  if (!values.length) return null;
  return Math.max(...values);
}

/**
 * Estimates total years of experience from a CV: explicit "N years" claims win, otherwise
 * the union of every "Mon YYYY – Mon YYYY/Present" range is summed.
 */
export function estimateYearsFromCv(text: string, now = new Date()): number {
  const explicit = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|industry\s+|total\s+|software\s+|engineering\s+|development\s+|commercial\s+|hands-on\s+)*(?:experience|in\s+(?:software|web|engineering|development))/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n <= 40);

  const ranges: [number, number][] = [];
  const rangeRe =
    /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+)?((?:19|20)\d{2})|(present|current|now|today|ongoing))/gi;
  for (const m of text.matchAll(rangeRe)) {
    const startMonth = m[1] ? MONTHS[m[1].toLowerCase().slice(0, 3)] : 0;
    const startYear = Number(m[2]);
    let endYear: number;
    let endMonth: number;
    if (m[5]) {
      endYear = now.getFullYear();
      endMonth = now.getMonth();
    } else {
      endYear = Number(m[4]);
      endMonth = m[3] ? MONTHS[m[3].toLowerCase().slice(0, 3)] : 11;
    }
    const start = startYear * 12 + startMonth;
    const end = endYear * 12 + endMonth;
    if (end > start && end - start < 12 * 40) ranges.push([start, end]);
  }

  let fromRanges = 0;
  if (ranges.length) {
    ranges.sort((a, b) => a[0] - b[0]);
    let [curStart, curEnd] = ranges[0];
    let months = 0;
    for (const [s, e] of ranges.slice(1)) {
      if (s <= curEnd) curEnd = Math.max(curEnd, e);
      else {
        months += curEnd - curStart;
        [curStart, curEnd] = [s, e];
      }
    }
    months += curEnd - curStart;
    fromRanges = Math.round((months / 12) * 10) / 10;
  }
  const explicitMax = explicit.length ? Math.max(...explicit) : 0;
  return Math.max(explicitMax, fromRanges);
}

/** Years explicitly tied to a skill in the CV ("5 years of React"), if any. */
export function explicitYearsForSkill(cv: string, skillName: string): number | null {
  const skill = getCompiled().find((s) => s.def.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) return null;
  for (const line of cv.split(/\r?\n/)) {
    if (!lineHasSkill(line, skill)) continue;
    const m = line.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i);
    if (m) return Number(m[1]);
  }
  return null;
}

export function findSkillByQuery(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  for (const skill of getCompiled()) {
    if (skill.regexes.some((re) => re.test(q))) return skill.def.name;
  }
  return null;
}

export function cvMentionsSkill(cv: string, skillName: string): boolean {
  const skill = getCompiled().find((s) => s.def.name.toLowerCase() === skillName.toLowerCase());
  return skill ? skill.regexes.some((re) => re.test(cv)) : false;
}

/* -------------------------------------------------------------------------- */
/* Seniority, domain, tone                                                     */
/* -------------------------------------------------------------------------- */

export function detectSeniority(text: string): SeniorityLevel {
  const t = text.toLowerCase();
  if (/\bprincipal\b/.test(t)) return "principal";
  if (/\bstaff\b/.test(t)) return "staff";
  if (/\b(?:lead|head of|engineering manager|tech lead)\b/.test(t)) return "lead";
  if (/\bsenior\b|\bsr\.?\b/.test(t)) return "senior";
  if (/\b(?:junior|jr\.?|graduate|entry[- ]level|associate)\b/.test(t)) return "junior";
  if (/\bintern(?:ship)?\b/.test(t)) return "intern";
  if (/\bmid[- ]level\b|\bintermediate\b/.test(t)) return "mid";
  return "unspecified";
}

export function seniorityFromYears(years: number): SeniorityLevel {
  if (years >= 10) return "staff";
  if (years >= 5) return "senior";
  if (years >= 2) return "mid";
  return "junior";
}

export const SENIORITY_RANK: Record<SeniorityLevel, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  unspecified: 2,
  senior: 3,
  lead: 4,
  staff: 4,
  principal: 5,
};

export function detectDomains(text: string): Set<string> {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const d of DOMAINS) {
    if (d.aliases.some((a) => new RegExp(`(?<![a-z0-9])${escapeRegex(a)}(?![a-z0-9])`).test(t))) found.add(d.name);
  }
  return found;
}

export function detectCompanyTone(text: string): string {
  const t = text.toLowerCase();
  const startup = (t.match(/\b(?:startup|start-up|fast-paced|fast paced|scrappy|move fast|early[- ]stage|seed|series [abc]|wear many hats|ship(?:ping)? fast|founder)\b/g) ?? []).length;
  const enterprise = (t.match(/\b(?:enterprise|fortune|compliance|governance|global team|stakeholders|large[- ]scale|regulated|process)\b/g) ?? []).length;
  const remote = /\bremote(?:-first)?\b/.test(t);
  const base =
    startup > enterprise + 1
      ? "Startup energy: fast-paced, high ownership, comfortable with ambiguity"
      : enterprise > startup + 1
        ? "Established organisation: structured, stakeholder-aware, process-conscious"
        : "Balanced product team: collaborative and delivery-focused";
  return remote ? `${base}; remote-friendly` : base;
}

export function guessJobTitle(text: string): string {
  const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (first && first.length <= 90 && /engineer|developer|architect|lead|manager|programmer|scientist|designer/i.test(first)) {
    return first.replace(/^(?:job title|title|position|role)\s*[:\-]\s*/i, "");
  }
  const m = text.match(/\b((?:senior|junior|staff|principal|lead|full[- ]stack|front[- ]?end|back[- ]?end)?\s*(?:software|web|platform|ml|ai|data|devops|mobile)?\s*(?:engineer|developer|architect))\b/i);
  return m ? m[1].replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase()) : "the role";
}

/* -------------------------------------------------------------------------- */
/* CV helpers                                                                  */
/* -------------------------------------------------------------------------- */

export function guessNameFromCv(cv: string): string {
  const first = cv.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (/^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(first) && !/\d/.test(first)) return first;
  return "";
}

const ACHIEVEMENT_VERB_RE =
  /^(?:built|led|designed|shipped|reduced|improved|migrated|launched|scaled|architected|implemented|created|developed|cut|increased|owned|delivered|introduced|mentored|wrote|optimi[sz]ed|partnered|set up|processed|raised|rebuilt|automated|integrated|established|drove|managed|maintained|refactored|deployed|enabled|streamlined|spearheaded|converted|won|grew|saved)\b/i;

export interface CvEvidence {
  line: string;
  skills: string[];
  score: number;
}

/** CV bullet lines ranked by how many wanted skills they evidence plus quantification. */
export function rankCvEvidence(cv: string, wanted: string[], limit = 4): CvEvidence[] {
  const wantedSet = new Set(wanted.map((w) => w.toLowerCase()));
  const compiledSkills = getCompiled().filter((s) => wantedSet.has(s.def.name.toLowerCase()));
  const lines = cv
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*·▪●]\s*/, "").trim())
    // Only achievement bullets that start with an action verb. This skips skill lists and summary prose,
    // and keeps the sentence usable after "I also …".
    .filter((l) => l.length > 35 && l.length < 320 && ACHIEVEMENT_VERB_RE.test(l) && (l.match(/,/g)?.length ?? 0) < 5);
  const ranked = lines.map((line) => {
    const skills = compiledSkills.filter((s) => lineHasSkill(line, s)).map((s) => s.def.name);
    const quantified = /\d+\s*(?:%|x\b|k\b|m\b|\+|ms\b|users|customers|requests|engineers|million|billion)|\$\s?\d/i.test(line) ? 1.5 : 0;
    return { line, skills, score: skills.length + quantified };
  });
  return ranked
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function quantifiedLineRatio(cv: string): number {
  const bullets = cv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-•*·▪●]/.test(l));
  if (!bullets.length) return 0;
  const quantified = bullets.filter((l) => /\d/.test(l)).length;
  return quantified / bullets.length;
}

export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Lower-cases the first letter unless the word is an acronym or proper token (TypeScript, AWS, CI/CD). */
export function lowerFirst(value: string): string {
  if (/^[A-Z]{2,}/.test(value) || /^[A-Z][a-z]+[A-Z]/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

const RESPONSIBILITY_VERB_RE =
  /^(?:own|design|build|lead|develop|create|collaborate|mentor|drive|ship|architect|manage|maintain|implement|work|partner|define|improve|deliver|write|optimi[sz]e|help|support|contribute|scale|operate|shape|champion|coach|review)\b/i;

/** First must-have bullet phrased as an action ("Own the architecture of…"), or null. */
export function pickResponsibility(mustHaves: string[]): string | null {
  const hit = mustHaves.find((m) => RESPONSIBILITY_VERB_RE.test(m.trim()));
  return hit ? lowerFirst(stripTrailingPunctuation(hit.trim())) : null;
}

export function stripTrailingPunctuation(value: string): string {
  return value.replace(/[\s.;:,]+$/, "");
}
