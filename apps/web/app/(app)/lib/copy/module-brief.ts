export interface ModuleBeforeItem {
  lead: string;
  /** Omitted where the lead says the whole thing — a warning carries more weight unexplained. */
  body?: string;
  /**
   * A prerequisite the founder must have met off-platform before starting,
   * not merely advice about how to answer well. Rendered as a warning
   * rather than another bullet — Module 4 is unworkable without the
   * Module 3 interviews, and a founder who reads past that wastes the
   * module.
   */
  severity?: "warning";
}

/**
 * The vague-vs-specific example card on the work step. Modules 1 and 2 chain
 * theirs deliberately: Module 1's `strongExample` (the customer sharp enough
 * to pressure-test) becomes Module 2's `weakExample` (the starting point it
 * narrows into a beachhead) — the same customer, carried forward and made
 * more specific, not two unrelated examples.
 */
export interface ModuleCoachingCard {
  heading: string;
  weakLabel: string;
  weakExample: string;
  strongLabel: string;
  strongExample: string;
  footer: string;
}

export interface ModuleBriefCopy {
  briefTitle: string;
  briefBody: string;
  whyBody: string;
  whyBuildsOn: (moduleIndex: string) => string;
  before: ModuleBeforeItem[];
  /**
   * Something the founder must hand the assistant before the questions
   * start — the first row of the work step's progress list, so it reads as
   * part of the same sequence as the rows it gates. The row is ticked by
   * the saved Artifact, not by an answered Question — see
   * `isWorkPrerequisiteMet`.
   *
   * No Module defines one today. Module 4 used to: its facilitator refused
   * to open until website-confirmed interview evidence existed. Interview
   * notes are now ordinary uploads on the Documents step, which gate
   * nothing, so this and `PREREQUISITE_ARTIFACT_KEY` are both empty. Kept
   * because a future Module may again take in something it does not
   * produce.
   */
  workPrerequisite?: { label: string; pending: string; done: string };
  /**
   * Optional Work-step row for files the Founder shared in chat (saved via
   * save_prep_extract). Unlike Module 4's interview gate, this never blocks
   * completion: 0 stays unchecked.
   */
  optionalPrepDocuments?: { label: string };
  /**
   * What is actually worth uploading on the Documents step, for this
   * Module specifically. Founders know they have "some notes somewhere"
   * but not which of them this Module can use, so the generic prompt gets
   * either nothing or a data dump. Each Module names concrete artefacts a
   * founder plausibly already has.
   *
   * Falls back to `moduleRunCopy.documentsBody` and no examples.
   */
  documentsBody?: string;
  documentsSuggestions?: string[];
  /**
   * What the founder has to go and do off-platform before the next Module
   * can work, shown on the confirm step once this one is signed off —
   * which is the moment it becomes their job. Only Module 3 has one: it
   * hands over five interviews to run, and Module 4 refuses to open its
   * questions until the notes come back. Saying so only in Module 4's
   * brief tells them after they have already started it.
   */
  completedNextStep?: { title: string; body: string };
  questionsLabel: string;
  /** Work-step CheckLine label/pending-detail for a Module with exactly one Artifact. */
  progressVerdict: string;
  progressVerdictPending: string;
  confirmTitle: string;
  confirmBody: string;
  confirmNoFileTitle: string;
  confirmNoFileBody: string;
  /** Undefined for Modules 3-4 today — StrongAnswerCard renders nothing without one. */
  coachingCard?: ModuleCoachingCard;
}

export const MODULE_BRIEF_COPY: Record<string, ModuleBriefCopy> = {
  "module-01-pressure-test": {
    briefTitle: "What this module is for",
    briefBody:
      "The goal of this module is to pressure-test your initial idea. The output will be supporting analysis for your idea that will include success conditions, potential failure reasons, recommended next steps and unresolved assumptions to help you hone your idea.",
    whyBody:
      "Most ideas fail because nobody asked the hard questions early enough. By the time the market answers them, a year and a lot of money are gone. This is the cheap version of that conversation.",
    whyBuildsOn: (moduleIndex: string) =>
      `Every module after Module ${moduleIndex} builds on the verdict you write here. Vague answers now cost you in each one.`,
    before: [
      {
        lead: "Set aside 30–45 minutes.",
        body: "Half-answers produce a verdict you can't use.",
      },
      {
        lead: "Be specific, not polished.",
        body: '"Founders who\'ve cold-emailed 50 investors and stalled" beats "early-stage startups". Rough wording is fine.',
      },
      {
        lead: "Expect pushback.",
        body: "You'll be given the strongest case against your idea, and vague answers will be challenged. That is intentional.",
      },
      {
        lead: "This doesn't replace talking to customers.",
        body: "Anything without a real conversation behind it is recorded as an assumption, not evidence.",
      },
    ],
    questionsLabel: "Six pressure-test questions",
    progressVerdict: "Verdict saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Read it over, then confirm",
    confirmBody:
      "Your verdict is saved and nothing is missing from it. Confirming marks this module done and opens the next one.",
    confirmNoFileTitle: "No file yet",
    confirmNoFileBody:
      "We haven't found a verdict in your workspace yet. Once it's saved, you sign it off here.",
    coachingCard: {
      heading: "From vague to testable",
      weakLabel: "Too vague to test",
      weakExample: "Everyone building a startup needs this.",
      strongLabel: "Specific enough to test",
      strongExample:
        "ANZ pre-seed SaaS founders raising their first $500k who've cold-emailed 50+ investors and stalled.",
      footer:
        "A specific customer, a clear situation, and evidence the problem is real.",
    },
  },

  "module-02-customer-avatar": {
    briefTitle: "What this module is for",
    briefBody:
      "The purpose of this module is to help you create a hypothesised ideal customer profile with a beachhead profile to further validate in customer interviews. At the end of this module you will receive a completed artefact that will include detail on who your beachhead customer could be, where to find them, what triggers their problem, what they need, buying signals, and who to include.",
    whyBody:
      'A product built for "everyone" is a product nobody urgently needs. Naming one beachhead customer precisely turns a vague idea into something you can actually find, interview and test with.',
    whyBuildsOn: (moduleIndex: string) =>
      `Every module after Module ${moduleIndex} builds on the customer you name here. A vague profile makes every later module vaguer too.`,
    before: [
      {
        lead: "Most founders take around 40–60 minutes.",
        body: "You can pause and resume at any time — eight focused conversation blocks, with a few short follow-up questions where needed, not thirteen separate interrogations.",
      },
      {
        lead: "Be specific rather than polished.",
        body: "A named role, a real trigger moment, and language you'd actually hear beat a tidy persona.",
      },
      {
        lead: "Say honestly when you do not know.",
        body: "An honest gap is recorded as an unknown, not invented to sound complete.",
      },
      {
        lead: "Treat the result as a hypothesis, not evidence.",
        body: "Completing the profile doesn't validate it — that's checked separately, field by field.",
      },
    ],
    optionalPrepDocuments: { label: "Uploaded files" },
    questionsLabel: "Eight customer-profile blocks",
    progressVerdict: "Customer profile saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Read it over, then confirm",
    confirmBody:
      "Your Ideal Customer Profile is saved. Confirming marks this module done and opens the next one.",
    confirmNoFileTitle: "No file yet",
    confirmNoFileBody:
      "Your Ideal Customer Profile hasn't arrived yet. Return to your AI assistant and ask it to save the profile, then refresh this page.",
    coachingCard: {
      heading: "From testable to targetable",
      weakLabel: "What Module 1 established",
      weakExample:
        "ANZ pre-seed SaaS founders raising their first $500k who've cold-emailed 50+ investors and stalled.",
      strongLabel: "Specific enough to target first",
      strongExample:
        "First-time ANZ B2B SaaS founders raising $300k–$700k, with no warm investor network, who have already contacted 50+ investors without securing enough meetings.",
      footer:
        "Same customer — now narrow them into the first group you can actually find, interview and sell to.",
    },
  },

  "module-03-problem-statement": {
    briefTitle: "What this module is for",
    briefBody:
      "The purpose of this module is to dig into the most valuable problems your customer has, the root causes of them, the intensity and priority need. You will receive a draft problem statement and a Customer Discovery Interview Guide for you to use to validate the problem space.",
    whyBody:
      "The first complaint a customer names is rarely the reason the problem persists. Building for the symptom instead of a testable root-cause hypothesis is how founders end up solving the wrong problem very well.",
    whyBuildsOn: (moduleIndex: string) =>
      `Every module after Module ${moduleIndex} builds on the root-cause hypothesis and interview questions you settle here. A shallow answer here means the interviews test the wrong thing.`,
    before: [
      {
        lead: "Allow 30–40 minutes.",
        body: 'Working down to a root-cause hypothesis takes a few more "why" turns than it feels like it should.',
      },
      {
        lead: "Be specific rather than polished.",
        body: '"No shared directory exists" beats "communication is hard" — a structural reason beats a tidy sentence.',
      },
      {
        lead: "Expect each answer to be challenged and taken deeper.",
        body: "The ladder produces a current root-cause hypothesis to test — not a proven fact at the first plausible-sounding answer.",
      },
      {
        lead: "This module creates interview questions, not customer evidence.",
        body: "You still have to run the five conversations yourself before the next module can grade what came back.",
      },
    ],
    completedNextStep: {
      title: "Next: talk to customers, then open Module 4",
      body: "Download your Problem Interview Guide (printable PDF), run real customer interviews offline, then record what you heard under Artefacts → Customer interviews. Open Proof to review and confirm the evidence — your AI assistant unlocks only after Confirm. Aim for five interviews; one completed interview is enough to continue.",
    },
    optionalPrepDocuments: { label: "Uploaded files" },
    questionsLabel: "Eight problem-statement questions",
    progressVerdict: "Problem Statement saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your problem and interview documents",
    confirmBody:
      "Your Problem Statement and Problem Interview Guide are saved. Confirming marks this module done and opens the next one.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 3 documents haven't arrived yet. Return to your AI assistant and ask it to save the Problem Statement and Problem Interview Guide, then refresh this page.",
    coachingCard: {
      heading: "From symptom to root-cause hypothesis",
      weakLabel: "Surface problem",
      weakExample:
        "Client onboarding information keeps getting missed or duplicated.",
      strongLabel: "Root-cause hypothesis",
      strongExample:
        "No one explicitly owns how client information moves across tools, so breakdowns are patched manually instead of the workflow being redesigned.",
      footer:
        "The first answer describes the pain. The second gives you a cause you can go and test.",
    },
  },

  "module-04-solution-statement": {
    briefTitle: "What this module is for",
    briefBody:
      "The purpose of this module is to turn the first beachhead customer and problem validation into a Minimum Loveable Product (MLP) solution with three Minimum Loveable Features, rational and emotional benefits, and a longer-term product North Star. Before you get started you will need to upload your raw transcripts from the customer interviews.",
    whyBody:
      '"Faster", "easier" and "AI-powered" are promises, not differences; a competitor can ship any of them next quarter. And a first version usually starts as a wishlist. This module refuses both — it pushes for a structural reason you win, and cuts the feature list to three.',
    whyBuildsOn: (moduleIndex: string) =>
      `Your beachhead customer and root-cause problem from Modules 2 and ${moduleIndex} are the inputs. The customer is replayed so you can confirm or refine it; you will not be asked to recreate the problem.`,
    before: [
      {
        lead: "Allow 40–45 minutes.",
        body: "Three conversation blocks: confirm the customer then name the category and why it wins, the three Minimum Loveable features and their benefits, then ranking and honest assumption risks.",
      },
      {
        lead: "Share your interview notes first.",
        body: "Paste or attach whatever you already have — interview write-ups, research, notes — directly in the chat. Your assistant transcribes and saves them at the start of the conversation. Quotes and validated features come only from real customer evidence, not from synthetic or QA material.",
      },
      {
        lead: "Expect your differentiator to be challenged.",
        body: "Generic promises get pushed back at least once. Rejected versions stay visible in the saved document, so the reasoning is not lost.",
      },
      {
        lead: "Three features, not ten.",
        body: "Your assistant proposes the three and you correct them — picking them yourself would be doing the prioritisation you came here for help with.",
      },
    ],
    questionsLabel: "Eight solution questions",
    progressVerdict: "Solution documents saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your solution documents",
    confirmBody:
      "Your North Star and Feature Benefit Map are saved. Confirming marks this module done.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 4 documents haven't arrived yet. Return to your AI assistant and ask it to save North Star and Feature Benefit Map, then refresh this page.",
  },

  "module-05-epics-user-stories": {
    briefTitle: "What this module is for",
    briefBody:
      "The purpose of this module is to translate three agreed Minimum Loveable Product (MLP) features into clear Epics, customer-focused user stories, a prioritised Sprint backlog that we can use to brief a developer.",
    whyBody:
      "Most first backlogs are a list of things to build, written from the team's side. Stories written as customer outcomes survive contact with reality better, because you can tell when one is actually done and whether anyone cares.",
    whyBuildsOn: (moduleIndex: string) =>
      `The three Minimum Loveable features from Module ${moduleIndex} become one epic each. Nothing new gets invented here — this module makes what you already chose shippable.`,
    before: [
      {
        lead: "Allow 45–50 minutes.",
        body: "Three blocks: epics from your features, stories for all three epics one at a time, then scoring and the cut.",
      },
      {
        lead: "You supply the scores, not your assistant.",
        body: "Value, confidence and effort for each story are yours to give. Confidence should drop where Module 4 marked a feature assumed rather than validated.",
      },
      {
        lead: "Engineering tasks get rewritten or cut.",
        body: '"Set up the database" is not a user story. Anything that reads as a task gets turned back into a customer outcome, or it does not make the backlog.',
      },
      {
        lead: "Effort is inverted on purpose.",
        body: "5 means least effort, so the score sorts quick wins customers care about to the top.",
      },
    ],
    optionalPrepDocuments: { label: "Uploaded files" },
    questionsLabel: "Six backlog questions",
    progressVerdict: "Backlog documents saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your backlog documents",
    confirmBody:
      "Your Epic Charter and Sprint Backlog are saved. Confirming marks this module done.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 5 documents haven't arrived yet. Return to your AI assistant and ask it to save Epic Charter and Sprint Backlog, then refresh this page.",
  },

  "module-06-competitive-analysis": {
    briefTitle: "What this module is for",
    briefBody:
      "The purpose of this module is to pressure-test the proposed competitive position using live competitor evidence, then define the market gap, curate three defensibility pillars, recommended positioning, Why Now, and Why Us.",
    whyBody:
      '"We have no real competitors" is never true — the status quo is a competitor, and it usually wins. Knowing precisely who you are beating, and why they cannot copy you next quarter, is what makes the rest of the plan credible.',
    whyBuildsOn: (moduleIndex: string) =>
      `The solution and differentiator from Module ${moduleIndex} are the claim under test here. This module asks whether they hold up against what already exists.`,
    before: [
      {
        lead: "Allow 50–55 minutes.",
        body: "Five blocks: live landscape, customer criteria and matrix, moat, positioning, then why now and why you.",
      },
      {
        lead: "Have competitor URLs ready to paste.",
        body: "Your assistant reads the live pages rather than recalling them. If a link cannot be fetched it will ask you for a replacement or pasted source text rather than pick another URL.",
      },
      {
        lead: '"Better, faster, cheaper" will be rejected.',
        body: "So will first-mover advantage. You will leave with exactly three pillars, each marked Evidence-backed or Emerging / Assumption — never invented to fill the count.",
      },
      {
        lead: "Every claim is marked evidence or assumption.",
        body: "Honest gaps are fine. Stating no traction plainly is stronger than implying some.",
      },
    ],
    optionalPrepDocuments: { label: "Uploaded files" },
    questionsLabel: "Nine competitive questions",
    progressVerdict: "Competitive documents saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your competitive documents",
    confirmBody:
      "Your Competitive Landscape and Defensible Position are saved. Confirming marks this module done.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 6 documents haven't arrived yet. Return to your AI assistant and ask it to save Competitive Landscape and Defensible Position, then refresh this page.",
  },

  "module-07-business-model": {
    briefTitle: "What this module is for",
    briefBody:
      "The purpose of this module is to turn the venture into a practical first-dollar business model: how to reach the first paying customer, comparisons on what to charge, what to spend, what the first 90 days could look like, and how to pressure-test the pricing before relying on it.",
    whyBody:
      "Pricing decided by feel is the most expensive guess a founder makes, and a plan that never requires talking to anyone is the most comfortable way to avoid finding out. Every number here is tagged as benchmarked or assumption so you can see which is which.",
    whyBuildsOn: (moduleIndex: string) =>
      `Who pays, what they are buying, and what they pay for it today all come from the modules before ${moduleIndex}. This one asks how the money actually moves.`,
    before: [
      {
        lead: "Allow 50–55 minutes.",
        body: "Three blocks: your constraints and goals, an AI-led model including prices and cash flow, then a pricing pressure-test.",
      },
      {
        lead: "Know your budget and your hours.",
        body: "Starting budget before revenue, and hours per week you can actually give this. Vague goals get pushed until they are measurable.",
      },
      {
        lead: "Exact prices, not 'premium'.",
        body: "Your assistant proposes exact prices. You review why this number and not twenty percent either side, and what evidence would change it.",
      },
      {
        lead: "Steps that need real conversations are marked.",
        body: "A cash plan that never requires talking to a customer gets flagged as exactly that. Agreeing to test a free prototype is not a paying customer.",
      },
    ],
    optionalPrepDocuments: { label: "Uploaded files" },
    questionsLabel: "Eight business-model questions",
    progressVerdict: "Business model documents saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your business model documents",
    confirmBody:
      "Your Business Model, Pricing Strategy, and 90-Day Cash Flow are saved. Confirming marks this module done.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 7 documents haven't arrived yet. Return to your AI assistant and ask it to save Business Model, Pricing Strategy, and 90-Day Cash Flow, then refresh this page.",
  },
};
