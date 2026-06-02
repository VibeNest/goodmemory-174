import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  parsePhase63BeamRecallDiagnosticCliOptions,
  runPhase63BeamRecallDiagnostic,
} from "../../scripts/run-phase-63-beam-recall-diagnostic";

function buildBeamRows(): unknown[] {
  return [
    {
      chat: [
        [
          {
            content: "Mira prefers terse rollback notes.",
            id: 1,
            index: "1,1",
            question_type: "preference",
            role: "user",
            time_anchor: "March-15-2024",
          },
          {
            content: "Theo owns the rollback checklist.",
            id: 2,
            index: null,
            question_type: null,
            role: "assistant",
            time_anchor: null,
          },
        ],
      ],
      conversation_id: "beam-recall-smoke",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Rollback"],
        theme: "Release operations",
        title: "Rollback Planning",
      },
      narratives: "Release planning labels",
      probing_questions: {
        information_extraction: [
          {
            answer: "Theo.",
            evidence_chat_ids: [2],
            question: "Who owns the rollback checklist?",
            question_id: "beam-recall-q1",
            question_type: "information_extraction",
          },
        ],
        preference_following: [
          {
            answer: "Keep rollback notes terse.",
            evidence_chat_ids: [1],
            question: "How should rollback notes be written?",
            question_id: "beam-recall-q2",
            question_type: "preference_following",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Mira",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildLatencyComparisonBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to optimize the fetch call latency in my prototype, which currently averages 250ms on a local network with Chrome v112.0.5615, and I want to reduce this latency further.",
      id: 38,
      role: "user",
    },
    {
      content:
        "I'm trying to decide between using pure JavaScript or React 18.2 for my frontend, but I chose vanilla JS for simplicity and faster deployment, can you help me implement the weather app using vanilla JavaScript with error handling and debounce delay for API calls?",
      id: 44,
      role: "user",
    },
    {
      content:
        "Certainly. Enhance the weather app using vanilla JavaScript by adding error handling, debounce delay for API calls, responsive UI, fetching weather data, handling invalid city names gracefully, and optimized performance with debounce functionality.",
      id: 45,
      role: "assistant",
    },
    {
      content:
        "I'm trying to optimize the autocomplete feature for my weather app, which has been tested with over 100 city inputs and has an average API response time of 280ms with a 95% success rate on valid cities.",
      id: 80,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the autocomplete feature in my weather app to reduce API calls while still providing a good user experience, and I've decided to limit the results to 5 items, but I'm wondering how to balance the trade-off with exhaustive search results using caching or adjusting debounce delay.",
      id: 94,
      role: "user",
    },
    {
      content:
        "Balancing the trade-off between reducing API calls and providing exhaustive search results is crucial. Use advanced caching, adjust debounce delay, pagination, infinite scrolling, and local storage for frequently used cities.",
      id: 95,
      role: "assistant",
    },
    {
      content:
        "I completed the city autocomplete feature, but I need help with fetchWeatherData error handling. I reduced average autocomplete input latency from 520ms to 290ms by optimizing event listeners and DOM updates, and I use a 5-item dropdown and 300ms debounce.",
      id: 124,
      role: "user",
    },
    {
      content:
        "Improve fetchWeatherData error handling with exponential backoff retry, null checks for autocomplete suggestions, responsive CSS media queries, Jest tests, and better configuration for OpenWeather endpoints.",
      id: 125,
      role: "assistant",
    },
    {
      content:
        "Review the autocomplete feature and improve error handling, null checks, debounce, rendering suggestions, HTTP 401 handling, and tests for successful responses, HTTP errors, and network errors.",
      id: 133,
      role: "assistant",
    },
    {
      content:
        "Prepare for user feedback with load testing, performance monitoring, scalability, caching strategy, database optimization, security, and note that average API response time improved to 220ms through caching and code optimizations.",
      id: 187,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "latency-comparison",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 2,
        subtopics: ["Weather app"],
        theme: "Weather app",
        title: "Weather app",
      },
      narratives: "Weather app latency comparison",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer: "The fetch call latency is faster.",
            evidence_chat_ids: [38, 80],
            question:
              "Between my fetch call latency and my autocomplete API response time, which one is currently faster based on my tests?",
            question_id: "latency-comparison-q1",
            question_type: "multi_session_reasoning",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Weather app developer",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildPatentFilingDeadlineReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I aim to file a provisional patent by June 1, 2024, but I'm not sure what steps to take next, can you guide me through the process and help me achieve my goal?",
      id: 30,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to conduct the prior art search myself or can the patent attorney handle it?",
      id: 46,
      role: "user",
    },
    {
      content:
        "Meeting with Ashlee is a crucial step in navigating the patent process. Discuss prior art search results, the provisional patent application, non-provisional patent strategy, grant application support, documentation, timelines, deadlines, costs, budgeting, and next steps.",
      id: 77,
      role: "assistant",
    },
    {
      content:
        "During the Ashlee meeting, focus on prior art search findings, provisional patent application content, timeline and deadlines, required documentation, grant application support, actionable steps, and milestones.",
      id: 79,
      role: "assistant",
    },
    {
      content:
        "I've got a deadline to meet for my non-provisional patent filing, which is set for November 10, 2024, and I'm hoping to get some guidance on how to move forward with the process",
      id: 164,
      role: "user",
    },
    {
      content:
        "hmm, what if I need to work on the patent application on Sundays occasionally?",
      id: 174,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to submit all documents at once through EFS-Web, or can I send them separately?",
      id: 186,
      role: "user",
    },
    {
      content:
        "Yeah, filing the PCT application sounds like a good move. It gives us the flexibility to decide later which countries to enter.",
      id: 202,
      role: "user",
    },
    {
      content:
        "Thanks for the detailed steps. I'll make sure to finalize the written description and claims, review the drawings and technical specs, and get Ashlee's final review before submitting.",
      id: 228,
      role: "user",
    },
    {
      content:
        "ok cool, do I need to start looking at specific regions or countries for these additional distributors?",
      id: 362,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "patent-filing-deadline-reasoning",
      conversation_plan: "BATCH 20 PLAN",
      conversation_seed: {
        category: "Legal and Administrative",
        id: 25,
        subtopics: [
          "Filing a provisional patent",
          "Filing a non-provisional patent",
          "Patent deadlines",
        ],
        theme: "Navigating the patent process from concept to legal protection",
        title: "Applying for a Patent to Protect a New Invention",
      },
      narratives: "Patent filing deadline comparison",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "June 1, 2024 for the provisional patent and November 10, 2024 for the non-provisional patent.",
            question:
              "What are the two different patent filing deadlines I need to meet?",
            question_id: "patent-filing-deadline-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [30, 164],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Patent applicant",
        user_relationships: "Ashlee, Linda",
      },
      user_questions: [],
    },
  ];
}

function buildPatentPriorArtFilingReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I aim to file a provisional patent by June 1, 2024, but I'm not sure what steps to take next, can you guide me through the process and help me achieve my goal?",
      id: 30,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that my prior art search, which I plan to complete by April 10, 2024, using the USPTO database and Google Patents, might not be thorough enough, can you help me make sure I'm covering all bases?",
      id: 32,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the prior art search I completed on April 10, 2024, which found 3 similar patents but none with AI tagging features, so can you help me understand how this affects my decision to file a provisional patent by May 15, 2024?",
      id: 70,
      role: "user",
    },
    {
      content:
        "Based on your prior art search findings, it seems that while there are some similar patents, none of them incorporate the AI tagging feature that your invention includes. This is a positive sign for the novelty and non-obviousness of your invention. Prepare detailed descriptions and drawings, file the provisional patent application by May 15, consult your patent attorney, and document every prototype test for the non-provisional application.",
      id: 71,
      role: "assistant",
    },
    {
      content:
        "I'm kinda worried about the cost, so can you help me understand how the provisional filing fee of $280 and the $1,200 attorney fee due May 15, 2024, will impact my budget",
      id: 100,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the provisional patent I filed on May 15, 2024, with the receipt number 12345678, and I was wondering if I should be doing anything now that it's July 10, 2024, to make sure everything is on track for the non-provisional patent",
      id: 122,
      role: "user",
    },
    {
      content:
        "It's great that you've already filed a provisional patent application on May 15, 2024. Continue keeping detailed records, prepare detailed descriptions and drawings, review prior art again, consult Ashlee, confirm budget and funding, and monitor competitor activity so the non-provisional patent application is well prepared.",
      id: 123,
      role: "assistant",
    },
    {
      content:
        "I've got a deadline to meet for my non-provisional patent filing, which is set for November 10, 2024, and I'm hoping to get some guidance on how to move forward with the process",
      id: 164,
      role: "user",
    },
    {
      content:
        "I'm working with Ashlee to draft a non-provisional patent application that we started on September 1, 2024, and I met her at her office on September 10 to review the 45-page draft including 12 drawings, so what's the best way to ensure we meet the November deadline?",
      id: 188,
      role: "user",
    },
    {
      content:
        "Thanks for the detailed steps. The main thing I'm worried about is making sure everything is clear and consistent during the review and revision phase.",
      id: 190,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the budget for my patent application, I've got $12,000 approved for the non-provisional filing and international PCT application by October 15, 2024, is that enough to cover everything?",
      id: 196,
      role: "user",
    },
    {
      content:
        "I've been thinking about my patent strategy a lot lately, especially since I decided to file the PCT application covering the US, Canada, and EU markets on October 20, 2024, and now that it's November 25, 2024, I'm wondering if I made the right decision in terms of timing and budget, given that I had approved a $12,000 budget for the non-provisional filing and international PCT application by October 15, 2024",
      id: 314,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "patent-prior-art-filing-reasoning",
      conversation_plan: "BATCH 20 PLAN",
      conversation_seed: {
        category: "Legal and Administrative",
        id: 25,
        subtopics: [
          "Conducting a prior art search",
          "Filing a provisional vs. non-provisional patent",
          "Working with a patent attorney",
        ],
        theme: "Navigating the patent process from concept to legal protection",
        title: "Applying for a Patent to Protect a New Invention",
      },
      narratives: "Patent prior art search and filing plan",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "You conducted a comprehensive prior art search covering multiple databases before filing, identified unique AI tagging features, filed the provisional on time, and kept documentation and budget steps aligned for a strong non-provisional filing.",
            question:
              "Given my timeline and actions from starting the prior art search to filing the provisional patent, how well did I align my search thoroughness, patent features, and budget to maximize my chances for a successful non-provisional filing?",
            question_id: "patent-prior-art-filing-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [32, 70, 71, 122, 123],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Patent applicant",
        user_relationships: "Ashlee, Jake",
      },
      user_questions: [],
    },
  ];
}

function buildProbabilityCalculationConfirmationReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to solve 10 probability problems involving single events with at least 80% accuracy by February 1, and I want to make sure I'm on track to meet my goal, including a coin probability of heads as 1/2 and rolling a 4 as 1/6.",
      id: 22,
      role: "user",
    },
    {
      content:
        "I'm trying to understand why tossing two coins is considered independent events, can you help me calculate P(both heads) using the formula 1/2 x 1/2 = 1/4, I want to make sure I get it right.",
      id: 30,
      role: "user",
    },
    {
      content:
        "I'm having trouble understanding the difference between mutually exclusive and independent events, especially in the context of rolling dice, and how rolling an even number on a 6-sided die relates to mutually exclusive events.",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm enjoying discussions about probability and want to calculate independent events like tossing two coins where P(both heads) = 1/2 x 1/2 = 1/4, plus drawing an ace, permutations, combinations, and rolling an even number.",
      id: 48,
      role: "user",
    },
    {
      content:
        "Always provide step-by-step explanations with concrete examples when I ask about probability concepts.",
      id: 64,
      role: "user",
    },
    {
      content:
        "I'm trying to understand conditional probability P(A|B) = P(A intersect B) / P(B), like drawing cards without replacement and the chance that the second card is also an ace.",
      id: 72,
      role: "user",
    },
    {
      content:
        "I'm trying to understand the concept of independence in probability, specifically with the example of rolling two dice, and I want to confirm if the probability of rolling a 6 on the first die and an even number on the second die is indeed 1/6 x 1/2 = 1/12, as this seems to be a fundamental principle of independent events.",
      id: 96,
      role: "user",
    },
    {
      content:
        "I'm trying to understand why the complement rule is essential in complex probability calculations, including drawing cards, birthday paradox, dice roll problems, and coin toss examples.",
      id: 150,
      role: "user",
    },
    {
      content:
        "Sure, I want to make sure I understand how to use the complement rule correctly in complex probability calculations, maybe with dice rolls or coin tosses.",
      id: 152,
      role: "user",
    },
    {
      content:
        "I'm trying to understand the concept of independence in dice roll sums, specifically after reviewing joint probability concepts, and I want to make sure I correct my earlier misunderstanding about independence in dice roll sums.",
      id: 226,
      role: "user",
    },
    {
      content:
        "Always combine algebraic formulas with visual diagrams when I ask about complex probability problems.",
      id: 234,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "probability-calculation-confirmation-reasoning",
      conversation_plan: "BATCH 5 PLAN",
      conversation_seed: {
        category: "Math",
        id: 8,
        subtopics: [
          "Independent and dependent events",
          "Coin toss and dice roll problems",
          "Common misconceptions about probability",
        ],
        theme: "Calculating simple probabilities and exploring common probability puzzles",
        title: "Understanding the Basics of Probability",
      },
      narratives: "Probability confirmation questions",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer: "Three",
            question:
              "In my questions about tossing coins and rolling dice, how many different probability calculations did I try to confirm?",
            question_id: "probability-calculation-confirmation-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [30, 96, 226],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Probability learner",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildKimberlyPersonalStatementReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to finalize my personal statement and I got feedback from Kimberly, a close friend since college, on March 10, but I'm not sure if I should make all the changes she suggested, what do you think?",
      id: 6,
      role: "user",
    },
    {
      content:
        "It's great that you have feedback from Kimberly, a trusted friend since college. However, deciding whether to implement all her suggestions requires careful consideration. Evaluate how each suggestion affects clarity, coherence, and effectiveness, maintain your unique voice, consider whether this is for a job application or grant proposal, and implement selected changes that enhance the statement.",
      id: 7,
      role: "assistant",
    },
    {
      content:
        "I'm kinda stuck on my personal statement, and I want to make sure I meet all the deadlines, like the scholarship deadline on May 15, 2024, and the visa application due June 1, 2024, so can you help me plan this out?",
      id: 12,
      role: "user",
    },
    {
      content:
        "Got it! When discussing writing aids or software, I will always include the tool names. Use Microsoft Word, Grammarly, Hemingway Editor, Google Calendar, Trello, Evernote, and Mendeley to finish the personal statement before the rescheduled professional editing session.",
      id: 101,
      role: "assistant",
    },
    {
      content:
        "I met Kimberly at Café Montserrat on May 7, and she praised the improved flow of my 900-word personal statement, but I'm still unsure if it's good enough for the grant application",
      id: 110,
      role: "user",
    },
    {
      content:
        "It's great to hear that Kimberly praised the improved flow of your 900-word personal statement after your meeting at Cafe Montserrat on May 7. To ensure that your statement is strong enough for the grant application, review the grant requirements, seek additional feedback, focus on clarity and conciseness, highlight achievements and potential, show passion and commitment, proofread, and ensure a strong conclusion.",
      id: 111,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "kimberly-personal-statement-reasoning",
      conversation_plan: "BATCH 9 PLAN",
      conversation_seed: {
        category: "Education",
        id: 12,
        subtopics: ["Personal statement", "Grant applications", "Feedback"],
        theme: "Refining a personal statement through mentor feedback",
        title: "Grant Application Personal Statement",
      },
      narratives: "Kimberly feedback and grant statement refinement",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "Kimberly's initial feedback led me to selectively integrate suggestions while maintaining my voice and clarity, and her later praise for the improved flow showed quality improvement, though I still needed to evaluate whether the statement was strong enough for the grant application.",
            question:
              "How did my interactions with Kimberly and the feedback I received influence the evolution and final quality of my personal statement for the grant application?",
            question_id: "kimberly-personal-statement-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [6, 7, 110, 111],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Grant applicant",
        user_relationships: "Kimberly",
      },
      user_questions: [],
    },
  ];
}

function buildStephenAnniversaryFreeWillReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda confused about how believing in free will can affect my motivation, like the 2022 University of Cambridge study said, so can you help me understand how that works, especially since I just resolved my conflict with Stephen, my romantic partner, by celebrating our anniversary at The Coral Reef restaurant?",
      id: 74,
      role: "user",
    },
    {
      content:
        "Yeah, that makes sense. I'll talk to Stephen about it and see what he thinks. Maybe we can start a new tradition for our anniversary, like having a special dinner or doing something we both enjoy.",
      id: 142,
      role: "user",
    },
    {
      content:
        "My romantic partner Stephen and I just celebrated 5 years together on May 20 with a dinner at The Sunset Grill on Bay Street, but I'm wondering how our relationship might change if I start questioning the concept of free will",
      id: 164,
      role: "user",
    },
    {
      content:
        "It's wonderful that you and Stephen celebrated 5 years together, and it's natural to reflect on how your relationship might evolve as you delve deeper into philosophical questions like the concept of free will.",
      id: 165,
      role: "assistant",
    },
    {
      content:
        "Yeah, I think talking about free will with Stephen can really help us understand each other better. I mean, it's not just about the big decisions but also the little ones we make every day. I think it could enhance our trust and make us more supportive of each other. Let's definitely keep having these discussions and see how they shape our relationship.",
      id: 166,
      role: "user",
    },
    {
      content:
        "Yeah, let's definitely keep having these discussions. I think it would be really helpful to talk about specific scenarios, like deciding whether to move to a new city for a job opportunity. That could give us a clearer picture of how our understanding of free will influences our decisions. Let's aim to have these talks regularly, maybe once a week.",
      id: 168,
      role: "user",
    },
    {
      content:
        "Yeah, the retreat really helped me see things differently. I feel like my decisions are more aligned with my values now, and it's making me more intentional about how I spend my time.",
      id: 214,
      role: "user",
    },
    {
      content:
        "Starting with empathy and honesty is a powerful way to approach such a sensitive conversation with Stephen about differing views on fate and free will.",
      id: 299,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "stephen-anniversary-free-will-reasoning",
      conversation_plan: "BATCH 12 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 12,
        subtopics: ["Free will", "Relationships", "Anniversaries"],
        theme: "Considering whether to believe in and live by free will",
        title: "Free Will and Relationship Decisions",
      },
      narratives: "Stephen anniversary and free-will discussions",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "The relationship moved from resolving conflict through an anniversary dinner at The Coral Reef, to a five-year celebration at The Sunset Grill, and then into regular free-will discussions about everyday decisions, trust, support, and concrete scenarios like moving for a job.",
            question:
              "How have my anniversary celebrations and discussions about free will with Stephen evolved in terms of location and topics we've focused on together?",
            question_id: "stephen-anniversary-free-will-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [74, 164, 166, 168],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Philosophy learner",
        user_relationships: "Stephen",
      },
      user_questions: [],
    },
  ];
}

function buildResumeDesignInstructionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm thinking of asking for a $10,000 salary increase based on my new resume and portfolio, but I'm not sure if that's too much, can you give me some advice on how to negotiate that?",
      id: 28,
      role: "user",
    },
    {
      content:
        "Negotiating a significant salary increase like $10,000 can be challenging. Research market rates, document achievements, prepare your case, and practice the conversation.",
      id: 29,
      role: "assistant",
    },
    {
      content:
        "I prefer using structured bullet points with quantified achievements over narrative paragraphs for clarity and ATS readability, can you help me create a sample resume section?",
      id: 36,
      role: "user",
    },
    {
      content:
        "Use structured bullet points with quantified achievements to make your resume clear, concise, and ATS-friendly.",
      id: 37,
      role: "assistant",
    },
    {
      content:
        "Always highlight quantified achievements when I ask about resume content improvements.",
      id: 94,
      role: "user",
    },
    {
      content:
        "I prefer using bullet points with quantified results over paragraphs, but how can I make sure that improves ATS parsing and recruiter readability?",
      id: 124,
      role: "user",
    },
    {
      content:
        "Use bullet points effectively with action verbs, quantified results, and standard resume sections for ATS parsing and recruiter readability.",
      id: 125,
      role: "assistant",
    },
    {
      content:
        "Always use quantified bullet points when I ask about resume content style.",
      id: 144,
      role: "user",
    },
    {
      content:
        "I just completed my certification in Advanced Digital Media Production on September 5, 2024, and I'm wondering how I can best highlight this new skill on my resume to make it pass any Applicant Tracking System.",
      id: 150,
      role: "user",
    },
    {
      content:
        "Highlight the certification with relevant keywords, quantify achievements, and place the skill in your summary, skills section, and work experience.",
      id: 151,
      role: "assistant",
    },
    {
      content:
        "How can I effectively showcase my decision to update my resume to include my latest certification and promotion in a way that passes any applicant tracking system?",
      id: 190,
      role: "user",
    },
    {
      content:
        "Use a professional summary, work experience section, skills section, and ATS-friendly formatting to showcase the certification and promotion.",
      id: 191,
      role: "assistant",
    },
    {
      content:
        "Always maintain a minimalist resume style with clear headings when I ask about resume design preferences.",
      id: 194,
      role: "user",
    },
    {
      content:
        "I'm trying to improve my resume for UK job applications, and I tested a new AI resume tool that increased keyword density by 22%, so how can I best utilize this tool to pass any applicant tracking system?",
      id: 246,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "resume-design-instruction",
      conversation_plan: "BATCH 6 PLAN",
      conversation_seed: {
        category: "Career",
        id: 6,
        subtopics: ["Resume", "ATS", "Design preferences"],
        theme: "Building a portfolio-ready resume",
        title: "Portfolio-Ready Resume",
      },
      narratives: "Resume content and design preferences",
      probing_questions: {
        instruction_following: [
          {
            answer:
              "Response should follow a minimalist approach with distinct section titles to organize content clearly.",
            question: "How should I desing my resume?",
            question_id: "resume-design-instruction",
            question_type: "instruction_following",
            source_chat_ids: [194],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildMorningSelfCarePreferenceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "These suggestions fit pretty well with what I'm already doing. I've started with the meditation app and it's been helping. I think I could use more support in setting up a consistent workout routine and maybe investing in better sleep habits.",
      id: 8,
      role: "user",
    },
    {
      content:
        "Thanks! I think these strategies will really help. I'll start by making sure my self-care activities are truly relaxing and avoiding any distractions. I'll also try to incorporate more short breaks throughout the day when work gets stressful.",
      id: 62,
      role: "user",
    },
    {
      content:
        "I prefer morning self-care routines, like the ones I've been doing, to boost my daytime energy, but I'm not sure how to make the most of them, can you help me optimize my morning routine? ->-> 2,13",
      id: 164,
      role: "user",
    },
    {
      content:
        "I reported an 85% job satisfaction in my July 1 self-assessment survey, which is up from 70% in March, what are some ways I can continue to improve my job satisfaction and maintain this positive trend? ->-> 4,17",
      id: 288,
      role: "user",
    },
    {
      content:
        "I'm trying to plan the next quarter at work and want to keep my stress low while staying productive, can you help me think through habits that support work-life balance?",
      id: 353,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "morning-self-care-preference",
      conversation_plan: "BATCH 18 PLAN",
      conversation_seed: {
        category: "Wellness",
        id: 18,
        subtopics: ["Self-care routines", "Energy", "Work-life balance"],
        theme: "Building sustainable self-care routines",
        title: "Self-Care And Energy",
      },
      narratives: "Self-care routine preferences",
      probing_questions: {
        preference_following: [
          {
            answer:
              "Response should focus on recommending or optimizing self-care activities that take place in the morning to enhance daytime energy, rather than suggesting evening routines.",
            question:
              "What are some ways I can structure my daily self-care routine to feel more energized throughout the day?",
            question_id: "morning-self-care-preference",
            question_type: "preference_following",
            source_chat_ids: [164],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Project manager",
        user_relationships: "David",
      },
      user_questions: [],
    },
  ];
}

function buildExcelDiningBudgetPreferenceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda stressed about our budget, and I prefer using Excel for control, so can you help me figure out how to make it work with my insistence on a $150 dining out budget, which Alexis wanted to increase to $250, and we compromised on $200 starting April? ->-> 1,19",
      id: 50,
      role: "user",
    },
    {
      content:
        "Thanks for the advice! I'll start by reviewing my current budget and seeing where I can allocate more funds to other goals. I think boosting my emergency fund to cover 6 months of expenses would be a good next step. I'll also set up new savings accounts for specific goals like a vacation fund or a car fund. And I'll keep using YNAB to track everything. Let's do it!",
      id: 200,
      role: "user",
    },
    {
      content:
        "I'm trying to plan my expenses, and I saw that my grocery budget was increased to $550 monthly starting September 15, so how can I make the most of this change to accommodate my dietary changes? ->-> 3,22",
      id: 204,
      role: "user",
    },
    {
      content:
        "My family member Ashlee's medical bills have stabilized at $250/month since February 2025, and I want to make sure I'm budgeting correctly for this expense, can you help me figure out how to factor this into my monthly budget ->-> 5,4",
      id: 280,
      role: "user",
    },
    {
      content:
        "I'm trying to meet my renovation goal by increasing my monthly savings to $400 starting March, how can I stay on track with this new budget ->-> 5,20",
      id: 310,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "excel-dining-budget-preference",
      conversation_plan: "BATCH 16 PLAN",
      conversation_seed: {
        category: "Lifestyle",
        id: 21,
        subtopics: [
          "Creating and maintaining a budget",
          "Tracking and adjusting spending habits",
        ],
        theme: "Managing money wisely",
        title: "Personal Finance",
      },
      narratives: "Budgeting tool and dining-out preferences",
      probing_questions: {
        preference_following: [
          {
            answer:
              "Response should focus on using simple, customizable tools like Excel rather than recommending complex budgeting apps or software.",
            question:
              "I want to set up a system to track my monthly expenses and stick to a dining out budget of $200 starting next month. How would you suggest I organize this?",
            question_id: "excel-dining-budget-preference",
            question_type: "preference_following",
            source_chat_ids: [50],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Finance-conscious household planner",
        user_relationships: "Alexis",
      },
      user_questions: [],
    },
  ];
}

function buildDigitalWillUpdatePreferenceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "That sounds like a great plan! I think adding personalized gifts and special instructions that reflect my sense of humor would be a fun way to make the will more personal. I'll definitely include some funny items and maybe even a small fund for a family game night. And I love the idea of a celebration of life where everyone can share funny stories and memories about me. Let's keep the laughter going!",
      id: 16,
      role: "user",
    },
    {
      content:
        "Always provide detailed explanations of legal terms when I ask about will requirements. ->-> 1,22",
      id: 62,
      role: "user",
    },
    {
      content:
        "I'm trying to finalize my will and I used \"WillMaker Pro\" software, which Natalie suggested on April 20, and it saved me 8 hours, but I want to make sure I've covered everything, can you review my progress? ->-> 2,4",
      id: 80,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the probate process taking 6-9 months in Montserrat, so I wanna prepare my documents accordingly, you know, to make it smoother, especially since I chose to update my will digitally using WillMaker Pro for flexibility and ease of future edits ->-> 2,16",
      id: 110,
      role: "user",
    },
    {
      content:
        "I've got a will review coming up on October 15, and I just scheduled it after some major family events, but I'm not sure if I should update my will to reflect any changes, can you guide me on what to consider during this review, especially since I've already made some updates like adding instructions for my digital assets? ->-> 2,21",
      id: 120,
      role: "user",
    },
    {
      content:
        "I prefer using electronic signatures for will updates to save time and reduce paper waste, can you help me understand how this works with the new probate e-filing system that Diana explained, which reduces processing time by 20% ->-> 4,15",
      id: 250,
      role: "user",
    },
    {
      content:
        "Always confirm attorney names and credentials when I ask about legal representation. ->-> 4,22",
      id: 270,
      role: "user",
    },
    {
      content:
        "I need help understanding how these changes will affect my estate plan, considering I've already updated my will to include Erica and I have Rachel's support with the digital assets, and I want to make sure everything is in order ->-> 5,4",
      id: 280,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "digital-will-update-preference",
      conversation_plan: "BATCH 19 PLAN",
      conversation_seed: {
        category: "Legal and Administrative",
        id: 24,
        subtopics: [
          "Updating your will after major life events",
          "Digital assets and online accounts",
        ],
        theme: "Protecting assets and ensuring wishes are honored after death",
        title: "Creating a Legally Valid Will and Estate Plan",
      },
      narratives: "Digital will update preferences",
      probing_questions: {
        preference_following: [
          {
            answer:
              "Response should recommend or acknowledge digital methods or tools that facilitate easy future edits and flexibility in updating wills, rather than only suggesting traditional paper-based or static options.",
            question:
              "I'm planning to make some updates to my will in the future. How would you suggest I keep my documents so that making changes later is straightforward?",
            question_id: "digital-will-update-preference",
            question_type: "preference_following",
            source_chat_ids: [110],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Estate planner",
        user_relationships: "Douglas, Natalie, Diana, Rachel",
      },
      user_questions: [],
    },
  ];
}

function buildExecutorCoExecutorPreferenceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Thanks for the detailed guide! I think I'd like to focus more on drafting the will and choosing an executor. Could you give me some tips on what to consider when picking an executor and how to structure the will effectively?",
      id: 2,
      role: "user",
    },
    {
      content:
        "Choosing an executor involves responsibility, trustworthiness, organizational skills, legal and financial knowledge, availability, and naming an alternate executor.",
      id: 3,
      role: "assistant",
    },
    {
      content:
        "I'm deciding between naming Douglas or Kevin as executor, but I've got an April 1 deadline, so I'm kinda stressed about making the right choice ->-> 1,11",
      id: 32,
      role: "user",
    },
    {
      content:
        "Choosing the right executor means comparing Douglas and Kevin on responsibility, organizational skills, legal knowledge, availability, emotional stability, trust, and willingness.",
      id: 33,
      role: "assistant",
    },
    {
      content:
        "I just read “Estate Planning Basics” by Montserrat Legal Aid on March 5 and rated it 4.5/5, now I'm wondering if I should apply some of the strategies I learned to my own estate planning, what do you think? ->-> 1,16",
      id: 44,
      role: "user",
    },
    {
      content:
        "Applying estate planning strategies can help with asset inventory, beneficiaries, drafting a comprehensive will, setting up trusts, powers of attorney, digital assets, and regular updates.",
      id: 45,
      role: "assistant",
    },
    {
      content:
        "I'm considering naming Douglas as my executor because of his organizational skills, but I'm also thinking about Kevin's legal background, what are the pros and cons of choosing between them? ->-> 1,17",
      id: 46,
      role: "user",
    },
    {
      content:
        "Douglas offers organizational skills, trust, and family support, while Kevin offers legal expertise, objectivity, and professionalism. A possible compromise is naming one primary executor and the other as secondary executor or co-executor.",
      id: 47,
      role: "assistant",
    },
    {
      content:
        "hmm, what if I decide to name both as co-executors, how do I ensure they work well together?",
      id: 48,
      role: "user",
    },
    {
      content:
        "Naming a guardian for minor children requires consent, clear documentation, court approval, and a backup guardian.",
      id: 77,
      role: "assistant",
    },
    {
      content:
        "Always include software version details when I ask about digital asset management tools. ->-> 2,23",
      id: 128,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "executor-coexecutor-preference",
      conversation_plan: "BATCH 19 PLAN",
      conversation_seed: {
        category: "Legal and Administrative",
        id: 24,
        subtopics: [
          "Choosing an executor",
          "Updating your will after major life events",
        ],
        theme: "Protecting assets and ensuring wishes are honored after death",
        title: "Creating a Legally Valid Will and Estate Plan",
      },
      narratives: "Executor preference and co-executor follow-up",
      probing_questions: {
        preference_following: [
          {
            answer:
              "Response should acknowledge the user's prior indication of valuing organizational skills in the executor role and recommend accordingly, rather than focusing solely on legal expertise or other unrelated factors.",
            question:
              "If I want to appoint someone to manage the responsibilities after I'm gone, what should I consider when choosing between different candidates?",
            question_id: "executor-coexecutor-preference",
            question_type: "preference_following",
            source_chat_ids: [46, 48],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Estate planner",
        user_relationships: "Douglas, Kevin",
      },
      user_questions: [],
    },
  ];
}

function buildTaskAppointmentDigitalToolsPreferenceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Thanks for the tips! Right now, I'm trying to set clearer boundaries by limiting work emails after 7 PM and taking more breaks during the day. But I still feel overwhelmed with the number of tasks and deadlines. Delegating is something I need to get better at. Any advice on how to do that effectively?",
      id: 2,
      role: "user",
    },
    {
      content:
        "Thanks! I think these strategies will really help. I'll start by making sure my self-care activities are truly relaxing and avoiding any distractions. I'll also try to incorporate more short breaks throughout the day and see if adding an extra 30 minutes of self-care on Wednesdays makes a difference.",
      id: 62,
      role: "user",
    },
    {
      content:
        "That sounds like a great plan! By implementing these strategies, you should be able to reduce your stress levels effectively.",
      id: 63,
      role: "assistant",
    },
    {
      content:
        "I prefer using digital tools like Trello and Google Calendar for task organization, can you help me set it up to better manage my workload? ->-> 1,16",
      id: 84,
      role: "user",
    },
    {
      content:
        "Using digital tools like Trello and Google Calendar can be effective for managing workload, including boards, due dates, calendar reminders, and syncing cards through IFTTT.",
      id: 85,
      role: "assistant",
    },
    {
      content:
        "That sounds like a solid plan! I'll start setting up Trello and Google Calendar right away. I think the integration with IFTTT will be super helpful for keeping everything synced. I might need a bit of help with setting up the IFTTT recipe though, so if you could walk me through that part, that'd be great. Otherwise, I'm excited to see how this streamlines my workflow!",
      id: 86,
      role: "user",
    },
    {
      content:
        "That looks great! I'll head over to IFTTT and set up the recipe. I think I got it, but if I run into any issues, I'll reach out. Thanks for walking me through it!",
      id: 88,
      role: "user",
    },
    {
      content:
        "I'm trying to reduce my weekly overtime, and I've managed to cut it down from 12 to 5 hours by April 7, which is a big achievement for me, so how can I keep this momentum going and continue to improve my focus during work hours? ->-> 2,14",
      id: 166,
      role: "user",
    },
    {
      content:
        "I'm trying to manage my leadership stress and delegation skills, especially after my July 3 therapy session, can you help me prioritize tasks for my new role? ->-> 4,10",
      id: 274,
      role: "user",
    },
    {
      content:
        "I'm trying to monitor my team's workload and my own task completion, so I've been using weekly Asana reports since July, but I'm not sure if this is the best way to track progress ->-> 5,8",
      id: 324,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "task-appointment-digital-tools-preference",
      conversation_plan: "BATCH 18 PLAN",
      conversation_seed: {
        category: "Therapy and Emotional Support",
        id: 23,
        subtopics: [
          "Time management and workload boundaries",
          "Lifestyle adjustments for sustained energy",
        ],
        theme: "Restoring energy and preventing future burnout",
        title: "Recovering from Workplace Burnout and Chronic Stress",
      },
      narratives: "Digital task and appointment organization tools",
      probing_questions: {
        preference_following: [
          {
            answer:
              "Response should recommend digital task and calendar management tools rather than paper-based planners or analog methods, aligning with the user's preference for digital organization.",
            question:
              "I'm trying to organize my tasks and appointments more effectively. What tools or methods would you suggest I use to keep everything on track?",
            question_id: "task-appointment-digital-tools-preference",
            question_type: "preference_following",
            source_chat_ids: [84, 86, 88],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Burnout recovery planner",
        user_relationships: "David",
      },
      user_questions: [],
    },
  ];
}

function buildInstructionWithReasoningBridgeBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to structure my single-page portfolio website using semantic HTML5 tags for better SEO compliance, and I want to make sure I'm using the <header>, <section>, and <footer> tags correctly.",
      id: 8,
      role: "user",
    },
    {
      content:
        "Your current HTML structure is a good start. Use appropriate semantic tags for better accessibility and SEO, add descriptive meta tags, and improve navigation.",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "I'm trying to optimize my Bootstrap v5.3.0 integration to keep the CSS and JS bundle size under 150KB combined for my single-page portfolio website sections like About, Skills, Projects, and Contact.",
      id: 48,
      role: "user",
    },
    {
      content:
        "To optimize Bootstrap integration and keep the bundle under 150KB, identify necessary components, use dynamic imports, and defer unused JavaScript components.",
      id: 49,
      role: "assistant",
    },
    {
      content:
        "Always include semantic HTML5 tag usage details when I ask about markup structure. ->-> 1,25",
      id: 54,
      role: "user",
    },
    {
      content:
        "I'm having trouble with a modal focus issue in my project, specifically with the tabindex attribute on the modal container div.",
      id: 80,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the performance of my modal popup, which currently has a 400ms delay due to synchronous image loading, and I'm planning lazy loading.",
      id: 96,
      role: "user",
    },
    {
      content:
        "Implementing lazy loading for modal images can improve performance by deferring image loading until the images are needed.",
      id: 97,
      role: "assistant",
    },
    {
      content:
        "I'm trying to integrate FontAwesome v6.4.0 CDN into my project for scalable vector icons in the skills and contact sections.",
      id: 176,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "instruction-with-reasoning-bridge",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["API error handling"],
        theme: "API error handling",
        title: "API Error Handling",
      },
      narratives: "API error handling instruction and rationale",
      probing_questions: {
        instruction_following: [
          {
            answer: "Include semantic HTML5 tag usage details.",
            evidence_chat_ids: [54],
            question:
              "How should I organize the different parts of a webpage in HTML?",
            question_id: "instruction-with-reasoning-bridge",
            question_type: "instruction_following",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Dev",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildEstateWillFinalizationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Ok cool, do I need to set up the trust separately from the will?",
      id: 20,
      role: "user",
    },
    {
      content:
        "I've got a meeting with attorney Stephanie on March 22 to finalize my will, and I know Montserrat law requires two witnesses for it to be valid, so I'm hoping she can guide me through the process.",
      id: 34,
      role: "user",
    },
    {
      content:
        "I've got a tight deadline for this $50,000 film pitch on April 10, and balancing that with creating a legally valid will is challenging, but I need to prioritize and make sure everything is in order.",
      id: 54,
      role: "user",
    },
    {
      content:
        "It's understandable to be concerned about the legal requirements for a valid will, especially the two-witness rule. Given that you plan to have attorney Stephanie review your will on May 1, this is a good opportunity to ensure that all requirements are met. Prepare witness information, decide whether to notarize the will, and confirm legal requirements with Stephanie.",
      id: 85,
      role: "assistant",
    },
    {
      content:
        "Preparing notarized affidavits for guardianship can streamline the probate process. Draft the affidavits, gather identification documents and birth certificates, consult with Stephanie, notarize the documents, and store them securely.",
      id: 183,
      role: "assistant",
    },
    {
      content:
        "I'm kinda worried about the probate process now that Stephanie revealed she's retiring in March 2025, and I need to find a new estate attorney to make sure everything is in order for my estate plan.",
      id: 206,
      role: "user",
    },
    {
      content:
        "The acceptance of electronic will signatures in Montserrat, effective as of July 2024, affects estate planning convenience, legal validity, security, and witness requirements, including the two-witness requirement.",
      id: 221,
      role: "assistant",
    },
    {
      content:
        "hmm, do I need to update my beneficiaries again if I add more digital assets in the future?",
      id: 230,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to notify anyone besides Douglas and Stephanie about the updated will?",
      id: 320,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to notify anyone else besides Douglas and Stephanie about the updated will?",
      id: 324,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "estate-will-finalization",
      conversation_plan: "BATCH 19 PLAN",
      conversation_seed: {
        category: "Estate planning",
        id: 19,
        subtopics: ["Will finalization"],
        theme: "Estate planning",
        title: "Will finalization",
      },
      narratives: "Will preparation and finalization",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "Preparing and finalizing the will requires reviewing two-witness requirements with Stephanie, preparing notarized guardianship affidavits, and accounting for electronic will signatures.",
            question:
              "Can you summarize what I need to know about preparing and finalizing my will and related documents?",
            question_id: "estate-will-finalization-summary",
            question_type: "summarization",
            source_chat_ids: [34, 85, 183, 221],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal",
        user_relationships: "Douglas, Stephanie, Kevin",
      },
      user_questions: [],
    },
  ];
}

function buildTimeStressCreativeCollaborationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried about balancing work and family, especially with my partner James, who's 53 and works in finance, always being supportive of my career decisions, but I don't know how to make sure I'm giving enough time to him and my daughters",
      id: 12,
      role: "user",
    },
    {
      content:
        "It's completely normal to worry about balancing work and family, especially when you have supportive partners and children to consider. Regular check-ins and planning can help you give enough time and attention to James and your daughters.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "I'm kinda worried about balancing my time between work and friends, like Carla, who I met at the Montserrat Film Festival in 2018, and she's always been a great graphic designer to bounce ideas off of",
      id: 22,
      role: "user",
    },
    {
      content:
        "Managing stress while balancing work and family schedules is crucial to maintaining both your mental health and your ability to meet your goals. Use mindfulness, regular exercise, structured breaks, realistic goal setting, and flexibility.",
      id: 45,
      role: "assistant",
    },
    {
      content:
        "Using Trello boards can definitely be a great way to manage your tasks and improve your time management, especially for a complex project like completing a pilot episode.",
      id: 89,
      role: "assistant",
    },
    {
      content:
        "Using Todoist to manage both your daily tasks and your weekend plans can be a highly effective strategy. Create a separate project for weekend plans and keep those tasks distinct from daily responsibilities.",
      id: 113,
      role: "assistant",
    },
    {
      content:
        "Pushing back the pilot delivery date to July 15 can be stressful, but with careful planning and effective time management, you can still meet the new deadline.",
      id: 127,
      role: "assistant",
    },
    {
      content:
        "Conflicting schedules can be a challenge, but there are several strategies you can employ to ensure that location scouting still proceeds smoothly with Jeremy.",
      id: 141,
      role: "assistant",
    },
    {
      content:
        "It's understandable to feel stressed about rejecting a significant offer like the $25,000 commercial shoot on August 30, especially when you have multiple priorities and deadlines to manage.",
      id: 201,
      role: "assistant",
    },
    {
      content:
        "Great job on co-hosting the virtual brainstorming session with Stephanie! Now, let's prioritize your tasks for the rest of the week to ensure you stay on track with your goals and commitments.",
      id: 211,
      role: "assistant",
    },
    {
      content:
        "Managing stress before your visit to the East Janethaven Art Gallery with Jeffrey is important. Continue mindfulness practices, breathing exercises, and other routines to keep your stress levels low.",
      id: 229,
      role: "assistant",
    },
    {
      content:
        "Organizing a creative workshop with Carla at The Blue Lagoon on December 7 requires careful planning and communication. Define objectives, share expectations with participants, coordinate logistics, and prepare contingency plans for scheduling conflicts.",
      id: 257,
      role: "assistant",
    },
    {
      content:
        "Maintaining a high level of productivity in collaborative work sessions, such as the efficient final edits you completed with Michele, involves setting clear objectives and goals.",
      id: 267,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "time-stress-creative-collaboration",
      conversation_plan: "BATCH 17 PLAN",
      conversation_seed: {
        category: "Lifestyle",
        id: 22,
        subtopics: ["Time management", "Stress", "Creative collaboration"],
        theme: "Organizing your schedule while protecting personal well-being",
        title: "Time Management for a Balanced Life",
      },
      narratives: "Time, stress, and creative collaboration management",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The user managed time with friends like Carla, used stress-management routines, organized daily and weekend tasks in Todoist, and planned creative workshops with clear communication and contingencies.",
            question:
              "Can you give me a summary of how I've been managing my time, stress, and creative collaborations throughout our recent conversations?",
            question_id: "time-stress-creative-collaboration-summary",
            question_type: "summarization",
            source_chat_ids: [22, 45, 113, 257],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal",
        user_relationships: "Carla, James, Stephanie, Jeffrey",
      },
      user_questions: [],
    },
  ];
}

function buildWeatherAutocompleteSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to implement city autocomplete using OpenWeather's Geocoding API v1, and I want to add a debounce delay of 300ms to reduce API calls. Here's my current code with geocodingApiUrl and apiKey placeholders.",
      id: 20,
      role: "user",
    },
    {
      content:
        "Certainly! Let's complete the implementation of the city autocomplete feature using the OpenWeather Geocoding API v1, including a debounce delay to reduce API calls. We'll add the HTML structure, JavaScript fetch flow, and a suggestions list.",
      id: 21,
      role: "assistant",
    },
    {
      content:
        "Handling cases where the API response time exceeds the debounce delay of 300ms is important. You can cancel previous requests if a new one is initiated and ensure stale autocomplete responses are ignored.",
      id: 23,
      role: "assistant",
    },
    {
      content:
        "If the user types quickly and the debounce delay isn't sufficient, dynamically adjust the debounce delay based on typing speed and ensure only the most recent autocomplete request is processed.",
      id: 25,
      role: "assistant",
    },
    {
      content:
        "I'm trying to handle errors for invalid city names in my weather app, and I want to display user-friendly messages for HTTP 404 and 400 status codes while using fetch with async/await.",
      id: 28,
      role: "user",
    },
    {
      content:
        "I'm trying to balance the autocomplete accuracy and API call cost for my weather app, and I've implemented a 300ms debounce to reduce the number of API calls. I'm not sure if this is the optimal solution.",
      id: 52,
      role: "user",
    },
    {
      content:
        "Your current implementation of the debounce function is a good start. Use a debounce utility function, handle API errors gracefully, cache repeated city lookups, and keep feedback visible while autocomplete suggestions load.",
      id: 53,
      role: "assistant",
    },
    {
      content:
        "I'm currently working on integrating city autocomplete into my weather app and want to make sure I'm handling API errors more robustly with a try-catch block around the OpenWeather API call.",
      id: 72,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the autocomplete feature in my weather app to reduce API calls while still providing a good user experience. I've decided to limit the results to 5 items and may add a more advanced caching mechanism or adjust the debounce delay.",
      id: 94,
      role: "user",
    },
    {
      content:
        "Balancing the trade-off between reducing API calls and providing exhaustive search results is crucial. Use an advanced caching mechanism, adjust the debounce delay, and consider pagination or infinite scrolling for autocomplete results.",
      id: 95,
      role: "assistant",
    },
    {
      content:
        "hmm, what about implementing a loading indicator while fetching autocomplete results to improve UX?",
      id: 96,
      role: "user",
    },
    {
      content:
        "Adding a loading indicator while fetching autocomplete results can significantly improve the user experience. Integrate a loading indicator into autocomplete.js so users see visual feedback while suggestions are requested.",
      id: 97,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "weather-autocomplete-summary",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 3,
        subtopics: [
          "Working with APIs in JavaScript",
          "Adding city autocomplete",
          "Error handling for invalid locations",
        ],
        theme: "Fetching and displaying weather data for user-specified locations",
        title: "Developing a Weather Forecast App in JavaScript with OpenWeather API",
      },
      narratives: "Weather app autocomplete implementation and improvements",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The user learned to build city autocomplete with OpenWeather Geocoding API v1, debounce requests, cancel stale requests, balance accuracy and API cost, cache suggestions, limit results, and show a loading indicator.",
            question:
              "Can you summarize what I learned about implementing and improving city autocomplete features in my weather app?",
            question_id: "weather-autocomplete-summary",
            question_type: "summarization",
            source_chat_ids: [20, 21, 23, 25, 52, 53, 94, 95, 96, 97],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Dev",
        user_relationships: "OpenWeather",
      },
      user_questions: [],
    },
  ];
}

function buildWebProjectIssueResolutionSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Absolutely, Craig! Let's fill in the missing functions for the color palette generator and integrate Bootstrap for styling the palette display.",
      id: 5,
      role: "assistant",
    },
    {
      content:
        "I'm trying to set up a single-page portfolio with sections for About, Skills, Projects, and Contact, and I want to target a 1200x800px desktop layout first.",
      id: 6,
      role: "user",
    },
    {
      content:
        "Let's enhance your HTML structure and add CSS3 styling using Bootstrap v5.3.0 for a responsive portfolio site with navigation and sections.",
      id: 7,
      role: "assistant",
    },
    {
      content:
        "I'm trying to integrate Bootstrap 5.3.0 CDN into my portfolio website for a responsive grid and components like navbar and cards.",
      id: 10,
      role: "user",
    },
    {
      content:
        "Let's refine the HTML structure to include a fully functional Bootstrap 5.3.0 navbar and card component for responsive design.",
      id: 11,
      role: "assistant",
    },
    {
      content:
        "To meet your six-week deadline, break the project into sprints with layout, navigation, responsive sections, gallery, and contact work.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "I'm trying to debug a CSS layout issue using Chrome DevTools v112 and the CSS box model. Can you help me calculate element width and height including padding, border, and margin?",
      id: 14,
      role: "user",
    },
    {
      content:
        "Let's break down the CSS layout issue into a JavaScript function to calculate the total width and height of an element including padding, border, and margin, then use Chrome DevTools to inspect and debug the box model. offsetWidth and offsetHeight already include padding and border, so add the margin values from getComputedStyle.",
      id: 15,
      role: "assistant",
    },
    {
      content:
        "I'm trying to implement the contact form with validation as part of my MVP features, but I'm having trouble getting form data to submit correctly.",
      id: 16,
      role: "user",
    },
    {
      content:
        "Build the contact form with Bootstrap v5.3.0 styling, JavaScript form handling, validation, and responsive integration with the navbar and project gallery.",
      id: 17,
      role: "assistant",
    },
    {
      content:
        "Check that Bootstrap JavaScript is loaded, that navbar-expand-lg sits on the navbar, and that required attributes are present.",
      id: 19,
      role: "assistant",
    },
    {
      content:
        "Review the code and use Bootstrap's responsive grid system to adjust the portfolio layout across screen sizes.",
      id: 21,
      role: "assistant",
    },
    {
      content:
        "I'm trying to optimize page load by compressing images under 200KB each with Python and Pillow.",
      id: 22,
      role: "user",
    },
    {
      content:
        "I'm trying to anticipate common errors like \"Uncaught TypeError: Cannot read property 'classList' of null\" during DOM manipulation with Bootstrap's navbar-expand-lg class.",
      id: 30,
      role: "user",
    },
    {
      content:
        "Prevent the classList null TypeError by checking for null values before accessing properties, using optional chaining, and wrapping critical navbar operations in try-catch blocks.",
      id: 31,
      role: "assistant",
    },
    {
      content:
        "I'm encountering an issue with my project gallery where some images are not loading, and I'm getting a \"Failed to load resource: the server responded with a status of 404\" error.",
      id: 62,
      role: "user",
    },
    {
      content:
        "For the project gallery 404 image issue, double-check relative image paths, file-name case sensitivity, build output, static file serving, and failed requests in the Network tab.",
      id: 63,
      role: "assistant",
    },
    {
      content:
        "Ok cool, do I need to check anything specific in the server logs to find the issue?",
      id: 64,
      role: "user",
    },
    {
      content:
        "In the server logs, look for 404 entries, requested image URLs, file path mismatches, permissions problems, static file serving configuration, and build process logs.",
      id: 65,
      role: "assistant",
    },
    {
      content:
        "I'm trying to fix this \"Uncaught ReferenceError: validateForm is not defined\" error, and I think I messed up the script src path in index.html.",
      id: 68,
      role: "user",
    },
    {
      content:
        "Make sure the script.js path is correct relative to index.html, verify the file structure, and define validateForm before calling it from the inline script.",
      id: 69,
      role: "assistant",
    },
    {
      content:
        "ok cool, do I need to check anything specific in the file structure to make sure everything links correctly?",
      id: 70,
      role: "user",
    },
    {
      content:
        "Ensuring the correct file structure is crucial for linking your JavaScript file and other resources properly. Verify whether index.html and script.js are in the same directory, whether script.js is in a js subdirectory, and whether script tags use the right relative or absolute paths so everything links correctly.",
      id: 71,
      role: "assistant",
    },
    {
      content:
        "I'm trying to fix this intermittent \"Formspree 500 Internal Server Error\" on my contact form submission, and I've added retry logic with exponential backoff.",
      id: 166,
      role: "user",
    },
    {
      content:
        "Separate retry logic from form submission, do not pass a retry option directly to fetch, handle HTTP 500 and network errors separately, and implement exponential backoff in retryFetch.",
      id: 167,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "web-project-issue-resolution-summary",
      conversation_plan: "BATCH 3 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 5,
        subtopics: ["Portfolio website", "Debugging", "Contact forms"],
        theme: "Creating and debugging a personal portfolio website",
        title: "Building a Portfolio Website with HTML, CSS, and Bootstrap",
      },
      narratives: "Portfolio setup and issue resolution",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The user debugged CSS box-model sizing, guarded navbar DOM manipulation, investigated project-gallery 404 image loading through paths and logs, corrected validateForm script linking and file structure, and handled Formspree 500s with retry logic.",
            question:
              "Can you summarize how I approached and resolved the various issues with my web project over time?",
            question_id: "web-project-issue-resolution-summary",
            question_type: "summarization",
            source_chat_ids: [
              14,
              15,
              30,
              31,
              62,
              63,
              64,
              65,
              68,
              69,
              70,
              71,
              166,
              167,
            ],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Craig",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildAiHiringProcessSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "It's understandable to be concerned about how AI might impact the human touch and collaborative dynamics that you and Michael have developed. Integrate AI into the hiring process by using AI for initial resume screening and basic qualification checks while preserving human oversight for final decisions, interviews, cultural fit, and interpersonal skills.",
      id: 25,
      role: "assistant",
    },
    {
      content:
        "Ensuring that the AI doesn't overlook candidates with strong soft skills is crucial. Balance AI screening with human structured interviews, behavioral questions, and evaluation criteria that include communication, teamwork, problem-solving, and adaptability.",
      id: 27,
      role: "assistant",
    },
    {
      content:
        "Integrating psychometric tests into your hiring process can help assess soft skills and personality traits. Consider MBTI, DISC, Big Five personality traits, and emotional intelligence assessments as inputs to the AI system.",
      id: 29,
      role: "assistant",
    },
    {
      content:
        "Given Wyatt's concerns about fairness of the AI tool, weigh the benefits of proceeding with the AI pilot, such as cutting interview rounds from 3 over 4 weeks to 2 weeks, against risks like algorithmic bias and candidate experience problems.",
      id: 63,
      role: "assistant",
    },
    {
      content:
        "Michael suggested integrating Pymetrics for soft skills assessment, which improved candidate fit by 20% in April hires, and I'm curious if this could be the key to making our hiring process more efficient.",
      id: 106,
      role: "user",
    },
    {
      content:
        "Integrating Pymetrics for soft skills assessment is an intriguing idea, especially given the 20% improvement in candidate fit observed in April hires. Pymetrics can improve fit, reduce interview rounds, shorten hiring cycles, and support data-driven decisions.",
      id: 107,
      role: "assistant",
    },
    {
      content:
        "I've allocated $8,000 for AI tool upgrades and staff training in the Q3 budget approved April 29, and I need to know whether this budget is enough to improve our hiring process.",
      id: 154,
      role: "user",
    },
    {
      content:
        "The $8,000 budget should be evaluated against AI tool licensing fees, staff training, external trainers, data encryption, security audits, and ongoing monitoring.",
      id: 155,
      role: "assistant",
    },
    {
      content:
        "I'm considering shifting Michael, who's shown interest in moving from editing to HR tech support, to a new role after our AI pilot's success, but I'm unsure if it's the right time.",
      id: 160,
      role: "user",
    },
    {
      content:
        "What's the best way to ensure the AI screening tool's 90% accuracy doesn't introduce bias into my hiring process, especially considering platform security concerns?",
      id: 170,
      role: "user",
    },
    {
      content:
        "Mitigate bias in AI screening with regular audits, diverse datasets, transparent algorithms, documentation, human oversight, and diverse review panels.",
      id: 171,
      role: "assistant",
    },
    {
      content:
        "I'm considering using AI to automate hiring, but I want to make sure it's fair, especially since Michael revealed he's developing AI fairness metrics on July 12 during lunch at The Green Turtle.",
      id: 192,
      role: "user",
    },
    {
      content:
        "I'm stressed about the hiring process, and Michael is going to present AI fairness findings at the Montserrat Tech Summit on August 22, so I'm wondering if I should use AI to automate hiring to reduce stress like the 25% reduction we've seen since AI implementation began.",
      id: 224,
      role: "user",
    },
    {
      content:
        "Michael's promotion to HR Tech Coordinator with a 10% salary increase to $48,000 effective August 1 makes me think he could help with implementing AI in our hiring process.",
      id: 246,
      role: "user",
    },
    {
      content:
        "Promoting Michael to HR Tech Coordinator can help implement AI hiring if you define implementation tasks, support duties, ethical oversight, training, and regular bias audits.",
      id: 247,
      role: "assistant",
    },
    {
      content:
        "We've seen an 80% reduction in scheduling conflicts since integrating the AI calendar with Outlook on September 20, and I'm wondering whether it is worth continuing AI interview scheduling.",
      id: 288,
      role: "user",
    },
    {
      content:
        "AI interview scheduling can improve efficiency, reduce conflicts, automate scheduling, improve candidate experience, and provide data-driven scheduling analytics.",
      id: 289,
      role: "assistant",
    },
    {
      content:
        "How can I use feedback from Michael's Montserrat Tech Summit presentation on January 8 to improve our hiring process?",
      id: 338,
      role: "user",
    },
    {
      content:
        "Use Michael's presentation feedback by gathering attendee comments, identifying key insights, building training modules, and running workshops on AI hiring transparency and ethics.",
      id: 339,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: null,
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "ai-hiring-process-summary",
      conversation_plan: "BATCH 11 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 16,
        subtopics: ["AI hiring", "Fairness", "Human oversight"],
        theme: "Balancing efficiency with fairness in recruitment",
        title: "Deciding Whether to Use AI to Automate Hiring",
      },
      narratives: "AI hiring process integration and decisions",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The hiring process evolved from preserving human oversight while using AI for screening, to soft-skills and psychometric assessment, a fairness-conscious pilot, Pymetrics efficiency gains, Michael's role transition, and later fairness-metrics and stress-reduction decisions about automation.",
            question:
              "Can you give me a comprehensive summary of how we've approached integrating AI into our hiring process, including the key steps, challenges, and decisions we've discussed so far?",
            question_id: "ai-hiring-process-summary",
            question_type: "summarization",
            source_chat_ids: [25, 27, 29, 63, 107, 160, 192, 224],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Hiring manager",
        user_relationships: "Michael, Wyatt",
      },
      user_questions: [],
    },
  ];
}

describe("phase-63 BEAM recall diagnostic runner", () => {
  it("parses recall diagnostic cli flags", () => {
    expect(
      parsePhase63BeamRecallDiagnosticCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-recall-diagnostic.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--profile",
        "goodmemory-rules-only",
        "--limit",
        "2",
        "--run-id",
        "run-beam-recall",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/BEAM",
      limit: 2,
      outputDir: undefined,
      profiles: ["goodmemory-rules-only"],
      runId: "run-beam-recall",
      scale: undefined,
    });
  });

  it("seeds BEAM chat turns into GoodMemory and scores retrieved chat ids", async () => {
    const writes = new Map<string, string>();
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-recall",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-05-18T00:20:00.000Z"),
        readFile: async (path) => {
          expect(path).toBe(join("/tmp/BEAM", "100K.json"));
          return JSON.stringify(buildBeamRows());
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.summary.totalCases).toBe(2);
    expect(report.summary.executionFailures).toBe(0);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.evidenceCaseCount,
    ).toBe(2);
    expect(
      report.profiles["goodmemory-rules-only"]?.cases.some((testCase) =>
        testCase.retrievedChatIds.includes(2),
      ),
    ).toBe(true);
    expect(writes.has("/tmp/out/run-beam-recall/recall-diagnostic.json")).toBe(
      true,
    );
  });

  it("keeps measured latency evidence for weather-app speed comparisons", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-latency-comparison",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-05-31T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildLatencyComparisonBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.evidenceChatRecall).toBe(1);
    expect(testCase?.retrievedChatIds).toEqual([38, 80]);
  });

  it("keeps will finalization source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-estate-will-finalization",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildEstateWillFinalizationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];
    expect(testCase?.evidenceChatRecall).toBe(1);
    expect(testCase?.retrievedChatIds).toEqual([34, 85, 183, 221]);
  });

  it("keeps time stress and creative collaboration source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-time-stress-creative-collaboration",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTimeStressCreativeCollaborationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.evidenceChatRecall).toBe(1);
    expect(testCase?.retrievedChatIds).toEqual([22, 45, 113, 257]);
  });

  it("keeps city autocomplete implementation and improvement source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-weather-autocomplete-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildWeatherAutocompleteSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.evidenceChatRecall).toBe(1);
    expect(testCase?.retrievedChatIds).toEqual([
      20,
      21,
      23,
      25,
      52,
      53,
      94,
      95,
      96,
      97,
    ]);
  });

  it("keeps web project issue-resolution source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-web-project-issue-resolution-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWebProjectIssueResolutionSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      14,
      15,
      30,
      31,
      62,
      63,
      64,
      65,
      68,
      69,
      70,
      71,
      166,
      167,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps AI hiring process source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-ai-hiring-process-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildAiHiringProcessSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([25, 27, 29, 63, 107, 160, 192, 224]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps patent filing deadline source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-patent-filing-deadline-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPatentFilingDeadlineReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([30, 164]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps patent prior-art and provisional filing reasoning source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-patent-prior-art-filing-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPatentPriorArtFilingReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([32, 70, 71, 122, 123]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps probability calculation confirmation source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-probability-calculation-confirmation-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildProbabilityCalculationConfirmationReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([30, 96, 226]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps Kimberly feedback and grant-statement refinement source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-kimberly-personal-statement-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildKimberlyPersonalStatementReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([6, 7, 110, 111]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps Stephen anniversary and free-will discussion source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-stephen-anniversary-free-will-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildStephenAnniversaryFreeWillReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([74, 164, 166, 168]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps typoed resume design instruction source turn through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-resume-design-instruction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildResumeDesignInstructionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([194]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps morning self-care preference source turn through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-morning-self-care-preference",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildMorningSelfCarePreferenceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([164]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps Excel dining budget preference source turn through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-excel-dining-budget-preference",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildExcelDiningBudgetPreferenceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([50]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps digital will update preference source turn through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-digital-will-update-preference",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildDigitalWillUpdatePreferenceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([110]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps executor and co-executor preference source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-executor-coexecutor-preference",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildExecutorCoExecutorPreferenceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([46, 48]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps task appointment digital tools preference source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-task-appointment-digital-tools-preference",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTaskAppointmentDigitalToolsPreferenceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([84, 86, 88]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("does not suppress instruction evidence after a reasoning bridge primary selection", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-instruction-with-reasoning-bridge",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildInstructionWithReasoningBridgeBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toContain(54);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });
});
