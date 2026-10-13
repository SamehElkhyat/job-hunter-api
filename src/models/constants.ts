/** Enumerations shared by the Mongoose schemas and the Zod request validators. */

export const APPLICATION_STATUSES = ["saved", "queue", "applied", "interview", "offer", "rejected"] as const;
export const CREATABLE_STATUSES = ["saved", "queue"] as const;
export const TONES = ["professional", "confident", "startup", "technical"] as const;
export const ENGINES = ["claude", "local"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const ACTIVITY_KINDS = ["created", "status", "note", "link", "document", "submitted"] as const;
export const LINK_KINDS = ["linkedin", "email", "posting", "other"] as const;

/** Key of the single-user singleton documents (Profile, Draft). */
export const SINGLETON_KEY = "default";
