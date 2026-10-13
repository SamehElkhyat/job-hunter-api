export type SkillCategory = "hard" | "tool" | "soft";

export interface SkillDef {
  /** Canonical display name. */
  name: string;
  category: SkillCategory;
  /** Case-insensitive aliases. A trailing `*` means "any word continuation" (stem match). */
  aliases?: string[];
  /** Aliases that must match case-sensitively (short words like "Go" or "R"). */
  caseSensitive?: string[];
}

const hard = (name: string, aliases: string[] = [], caseSensitive: string[] = []): SkillDef => ({
  name,
  category: "hard",
  aliases,
  caseSensitive,
});
const tool = (name: string, aliases: string[] = [], caseSensitive: string[] = []): SkillDef => ({
  name,
  category: "tool",
  aliases,
  caseSensitive,
});
const soft = (name: string, aliases: string[] = []): SkillDef => ({
  name,
  category: "soft",
  aliases,
});

export const SKILLS: SkillDef[] = [
  // ---- Languages -----------------------------------------------------------
  hard("JavaScript", ["javascript", "ecmascript", "es6", "es2015"], ["JS"]),
  hard("TypeScript", ["typescript"], ["TS"]),
  hard("Python", ["python"]),
  hard("Java", ["java"]),
  hard("Go", ["golang"], ["Go"]),
  hard("Rust", ["rust"]),
  hard("C#", ["c#", "csharp"]),
  hard("C++", ["c++", "cpp"]),
  hard("PHP", ["php"]),
  hard("Ruby", ["ruby"]),
  hard("Kotlin", ["kotlin"]),
  hard("Swift", [], ["Swift"]),
  hard("Scala", ["scala"]),
  hard("SQL", ["sql", "t-sql", "pl/sql"]),
  hard("Bash", ["bash", "shell scripting", "shell script*"]),
  hard("HTML/CSS", ["html", "html5", "css", "css3"]),

  // ---- Frameworks & libraries ---------------------------------------------
  hard("React", ["react", "react.js", "reactjs"]),
  hard("Next.js", ["next.js", "nextjs"]),
  hard("Vue", ["vue", "vue.js", "vuejs", "nuxt"]),
  hard("Angular", ["angular", "angularjs"]),
  hard("Svelte", ["svelte", "sveltekit"]),
  hard("React Native", ["react native"]),
  hard("Node.js", ["node.js", "nodejs", "node js"]),
  hard("Express", ["express.js", "expressjs"], ["Express"]),
  hard("NestJS", ["nestjs", "nest.js"]),
  hard("Django", ["django"]),
  hard("Flask", ["flask"]),
  hard("FastAPI", ["fastapi"]),
  hard("Spring Boot", ["spring boot", "spring framework"]),
  hard(".NET", [".net", "dotnet", "asp.net"]),
  hard("Ruby on Rails", ["ruby on rails", "rails"]),
  hard("Redux", ["redux", "zustand", "mobx"]),
  hard("Tailwind CSS", ["tailwind", "tailwindcss"]),
  hard("GraphQL", ["graphql", "apollo"]),
  hard("tRPC", ["trpc"]),

  // ---- Concepts & domains --------------------------------------------------
  hard("REST APIs", ["restful", "rest api*", "api design", "openapi", "swagger"], ["REST"]),
  hard("gRPC", ["grpc", "protobuf", "protocol buffers"]),
  hard("WebSockets", ["websocket*", "socket.io", "server-sent events"]),
  hard("Microservices", ["microservice*", "service-oriented", "service oriented"]),
  hard("System Design", ["system design", "software architecture", "scalable systems", "architecture design"]),
  hard("Distributed Systems", ["distributed system*", "distributed computing"]),
  hard("Event-Driven Architecture", ["event-driven", "event driven", "event sourcing", "cqrs", "pub/sub"]),
  hard("Machine Learning", ["machine learning", "deep learning", "pytorch", "tensorflow", "scikit-learn"]),
  hard("LLMs", ["llm*", "large language model*", "generative ai", "genai", "openai", "anthropic", "claude api"]),
  hard("RAG", ["rag", "retrieval-augmented", "retrieval augmented", "vector search", "embeddings"]),
  hard("Prompt Engineering", ["prompt engineering", "prompt design"]),
  hard("Data Structures & Algorithms", ["data structures", "algorithms"]),
  hard("Test-Driven Development", ["tdd", "test-driven", "test driven", "unit test*", "integration test*", "automated test*", "test suite*", "test coverage", "end-to-end test*", "e2e"]),
  hard("Web Performance", ["web performance", "core web vitals", "performance optimi*", "lighthouse", "time-to-interactive", "time to interactive", "page load", "load time", "bundle size", "lazy loading", "code splitting"]),
  hard("Accessibility", ["accessibility", "wcag", "a11y", "aria"]),
  hard("Security", ["owasp", "application security", "appsec", "secure coding", "penetration test*"]),
  hard("Authentication", ["oauth", "oauth2", "oidc", "openid", "jwt", "sso", "saml"]),
  hard("Server-Side Rendering", ["server-side rendering", "ssr", "static site generation", "ssg", "isr"]),
  hard("State Management", ["state management"]),
  hard("Design Systems", ["design system*", "component librar*"]),
  hard("Data Modeling", ["data model*", "database design", "schema design"]),
  hard("ETL / Data Pipelines", ["etl", "data pipeline*", "airflow", "dbt", "spark"]),
  hard("Mobile Development", ["ios", "android", "mobile development", "mobile app*"]),
  hard("Serverless", ["serverless", "lambda", "cloud functions"]),

  // ---- Tools & platforms ---------------------------------------------------
  tool("AWS", ["aws", "amazon web services", "ec2", "s3", "cloudfront", "dynamodb"]),
  tool("GCP", ["gcp", "google cloud", "bigquery"]),
  tool("Azure", ["azure"]),
  tool("Docker", ["docker", "containeri*", "docker-compose"]),
  tool("Kubernetes", ["kubernetes", "k8s", "helm", "eks", "gke"]),
  tool("Terraform", ["terraform", "infrastructure as code", "iac", "pulumi", "cloudformation"]),
  tool("CI/CD", ["ci/cd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment", "github actions", "gitlab ci", "jenkins", "circleci"]),
  tool("Git", ["git", "github", "gitlab", "bitbucket"]),
  tool("PostgreSQL", ["postgresql", "postgres"]),
  tool("MySQL", ["mysql", "mariadb"]),
  tool("MongoDB", ["mongodb", "mongo", "mongoose"]),
  tool("Redis", ["redis", "memcached"]),
  tool("Elasticsearch", ["elasticsearch", "opensearch", "elastic stack"]),
  tool("Kafka", ["kafka", "rabbitmq", "sqs", "kinesis", "message queue*"]),
  tool("Prisma", ["prisma", "drizzle", "typeorm", "sequelize", "sqlalchemy"]),
  tool("Webpack/Vite", ["webpack", "vite", "rollup", "esbuild", "turbopack"]),
  tool("Jest", ["jest", "vitest", "mocha", "pytest", "junit"]),
  tool("Cypress/Playwright", ["cypress", "playwright", "selenium", "puppeteer", "testing library"]),
  tool("Datadog/Observability", ["datadog", "grafana", "prometheus", "new relic", "observability", "opentelemetry", "sentry", "splunk"]),
  tool("Linux", ["linux", "unix"]),
  tool("Vercel", ["vercel", "netlify", "cloudflare"]),
  tool("Supabase/Firebase", ["supabase", "firebase", "appwrite"]),
  tool("Storybook", ["storybook", "chromatic"]),
  tool("Figma", ["figma"]),
  tool("Jira", ["jira", "confluence", "asana"]),
  tool("Stripe", ["stripe", "paypal", "payment integration*"]),
  tool("Monorepo tooling", ["monorepo", "turborepo", "nx", "pnpm", "lerna"]),
  tool("LangChain", ["langchain", "llamaindex", "langgraph", "vercel ai sdk"]),
  tool("Vector databases", ["pinecone", "weaviate", "pgvector", "qdrant", "chroma", "milvus"]),

  // ---- Soft skills (evidence-style stems) ---------------------------------
  soft("Communication", ["communicat*", "presented", "presentations", "documentation", "written and verbal", "storytelling"]),
  soft("Leadership", ["leadership", "led a", "led the", "led team*", "team lead", "tech lead", "managed a team", "people management"]),
  soft("Mentoring", ["mentor*", "coach*", "onboard*", "code review*", "knowledge sharing"]),
  soft("Collaboration", ["collaborat*", "cross-functional", "cross functional", "partnered", "pair programming", "worked closely"]),
  soft("Ownership", ["ownership", "owned", "end-to-end", "drove", "initiative", "self-starter", "autonomous*", "proactive*"]),
  soft("Problem Solving", ["problem-solving", "problem solving", "troubleshoot*", "debugg*", "root cause", "analytical"]),
  soft("Stakeholder Management", ["stakeholder*", "client-facing", "customer-facing", "product manager*", "requirements gathering"]),
  soft("Agile", ["agile", "scrum", "kanban", "sprint*"]),
  soft("Adaptability", ["adaptab*", "fast-paced", "fast paced", "ambiguity", "learn quickly", "quick learner"]),
  soft("Strategic Thinking", ["strategic", "roadmap*", "technical strategy", "prioriti*"]),
];

/** Industry/domain terms used for the domain-fit part of the experience score. */
export const DOMAINS: { name: string; aliases: string[] }[] = [
  { name: "fintech", aliases: ["fintech", "payments", "banking", "trading", "financial services", "insurtech"] },
  { name: "e-commerce", aliases: ["e-commerce", "ecommerce", "marketplace", "retail", "checkout"] },
  { name: "healthcare", aliases: ["healthcare", "health tech", "healthtech", "clinical", "medical", "hipaa"] },
  { name: "SaaS", aliases: ["saas", "b2b", "multi-tenant", "subscription"] },
  { name: "AI/ML", aliases: ["artificial intelligence", "machine learning", "generative ai", "llm"] },
  { name: "developer tools", aliases: ["developer tools", "devtools", "developer experience", "sdk", "open source", "open-source"] },
  { name: "gaming", aliases: ["gaming", "game development", "unity", "unreal"] },
  { name: "media", aliases: ["streaming", "media", "publishing", "adtech", "advertising"] },
  { name: "logistics", aliases: ["logistics", "supply chain", "delivery", "mobility"] },
  { name: "edtech", aliases: ["edtech", "education", "e-learning", "learning platform"] },
  { name: "security", aliases: ["cybersecurity", "infosec", "identity", "compliance"] },
  { name: "data platform", aliases: ["data platform", "analytics", "data engineering", "business intelligence"] },
];

export const CRITICAL_SECTION_RE =
  /^(?:#+\s*)?(?:requirements?|qualifications?|must[- ]haves?|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|you (?:have|bring)|about you|who you are|minimum qualifications|basic qualifications|required(?: skills| experience)?|skills(?: & experience)?|experience required)\b/i;
export const NICE_SECTION_RE =
  /^(?:#+\s*)?(?:nice[- ]to[- ]haves?|bonus(?: points)?|preferred(?: qualifications| skills)?|good to have|a plus|extra credit|it(?:'|’)?s a plus|desirable|ideally)\b/i;
export const RESPONSIBILITY_SECTION_RE =
  /^(?:#+\s*)?(?:responsibilities|what you(?:'|’)?ll do|the role|your role|in this role|day[- ]to[- ]day|what you will do|key responsibilities|the job|about the (?:role|job|position))\b/i;
export const IGNORE_SECTION_RE =
  /^(?:#+\s*)?(?:benefits|perks|what we offer|compensation|why join|about us|about the company|our values|equal opportunity|how to apply|salary)\b/i;
