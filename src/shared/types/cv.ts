/** A single saved version of the user's CV. Applications pin the version they were sent with. */
export interface CVVersion {
  id: string;
  /** Human label, e.g. "Full-Stack v3 – React focus". */
  label: string;
  /** Plain-text CV body used for analysis and prompt context. */
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** Structured candidate facts used for auto-fill and recruiter-question answers. */
export interface CandidateProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  currentTitle: string;
  currentCompany: string;
  /** Total years of professional experience (number as typed by user). */
  yearsExperience: string;
  expectedSalary: string;
  salaryCurrency: string;
  noticePeriod: string;
  workAuthorization: string;
  willingToRelocate: boolean;
  requiresSponsorship: boolean;
  /** Free-form answer to "how did you hear about us" style questions. */
  referralSource: string;
}

export const EMPTY_PROFILE: CandidateProfile = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  portfolio: "",
  currentTitle: "",
  currentCompany: "",
  yearsExperience: "",
  expectedSalary: "",
  salaryCurrency: "USD",
  noticePeriod: "",
  workAuthorization: "",
  willingToRelocate: false,
  requiresSponsorship: false,
  referralSource: "",
};
