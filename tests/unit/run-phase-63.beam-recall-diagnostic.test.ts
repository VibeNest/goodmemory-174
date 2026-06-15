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

function buildWeatherFeatureConcernCountBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "We reviewed asynchronous fetch error handling and validated OpenWeather weather responses.",
      id: 15,
      role: "assistant",
    },
    {
      content:
        "I'm trying to implement a responsive design for my weather app using CSS Grid and Flexbox, targeting mobile and desktop devices.",
      id: 26,
      role: "user",
    },
    {
      content:
        "I'm trying to handle errors for invalid city names in my weather app, and I want to display user-friendly messages for HTTP 404 and 400 status codes.",
      id: 28,
      role: "user",
    },
    {
      content:
        "Use try-catch around the OpenWeather API call and show friendly invalid city messages.",
      id: 29,
      role: "assistant",
    },
    {
      content:
        "I'm trying to handle the API rate limit for my weather app; can I use a simple counter to track the number of calls made per minute and per day? How can I improve this to handle the 60 calls/minute and 1000 calls/day rate limits for my OpenWeather API key obtained on March 10, 2024?",
      id: 32,
      role: "user",
    },
    {
      content: "hmm, what happens if the user makes rapid consecutive calls?",
      id: 34,
      role: "user",
    },
    {
      content:
        "Handling rapid consecutive API calls is crucial to ensure that your application does not exceed the rate limits set by the API provider. This approach helps manage rapid consecutive calls effectively and prevents exceeding the API rate limits.",
      id: 35,
      role: "assistant",
    },
    {
      content:
        "hmm, what if the user keeps retrying after hitting the rate limit? How do we handle that?",
      id: 36,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the autocomplete feature for my weather app, which has been tested with over 100 city inputs and has an average API response time of 280ms with a 95% success rate on valid cities.",
      id: 80,
      role: "user",
    },
    {
      content:
        "I'm trying to implement a custom feature for my weather app to maintain full control and avoid external dependency risks, as per my preference statement, but I'm not sure how to start.",
      id: 122,
      role: "user",
    },
    {
      content:
        "I'm trying to understand the recent uptime monitoring results, which show a perfect 100% availability over the past 7 days, and I want to know how this reflects on our improved stability.",
      id: 190,
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
      conversation_id: "weather-feature-concern-count",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 3,
        subtopics: ["Weather app", "API rate limits", "Monitoring"],
        theme: "Weather app reliability and feature development",
        title: "Developing a Weather Forecast App in JavaScript with OpenWeather API",
      },
      narratives: "Weather app features and concerns",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer: "Four",
            question:
              "How many different features or concerns did I mention wanting to handle across my weather app conversations?",
            question_id: "weather-feature-concern-count",
            question_type: "multi_session_reasoning",
            source_chat_ids: [32, 34, 36, 122, 190],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Weather app developer",
        user_relationships: "OpenWeather",
      },
      user_questions: [],
    },
  ];
}

function buildDashboardApiResponseTimeUpdateBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm working on a project with a Time Anchor of March 15, 2024, and I need to plan my tasks accordingly.",
      id: 0,
      role: "user",
    },
    {
      content:
        "I'm trying to handle errors in my Flask app, specifically for 404 and 500 errors, and I want to return custom JSON responses for my API endpoints.",
      id: 26,
      role: "user",
    },
    {
      content:
        "Return custom JSON responses with proper HTTP status codes for 404 and 500 errors.",
      id: 27,
      role: "assistant",
    },
    {
      content:
        "I'm trying to integrate Flask-Login v0.6.2 for session management with secure password hashing and proper error handling.",
      id: 66,
      role: "user",
    },
    {
      content:
        "I'm working on sprint 2 which targets analytics by April 19, and I've already completed sprint 1 on March 29 with user auth and basic transaction CRUD.",
      id: 86,
      role: "user",
    },
    {
      content:
        "Your dashboard API response time can improve through SQL query optimization, indexes, and caching.",
      id: 105,
      role: "assistant",
    },
    {
      content:
        "I'm trying to optimize the dashboard API response time, which was initially 800ms, and I've managed to reduce it to 300ms by optimizing SQL queries and caching results for 60 seconds.",
      id: 104,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the dashboard API response time, which has recently improved to 250ms after adding some caching tweaks, but I want to make sure I'm using the latest versions of my dependencies, like Flask-Login, which I've never actually integrated into this project, so I'm starting from scratch.",
      id: 108,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the dashboard API response time, which has recently improved to 250ms after adding some caching tweaks, but I want to make sure I'm using the latest versions of my dependencies, like Flask-Login, which I've never actually integrated into this project, so I'm starting from scratch, and also considering the fact that I've already completed the user registration and login modules, now focusing on transaction CRUD and analytics integration.",
      id: 114,
      role: "user",
    },
    {
      content:
        "Integrate Flask-Login 0.6.2 with login, logout, session validation, and dashboard caching.",
      id: 115,
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
      conversation_id: "dashboard-api-response-time-update",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Flask", "Analytics", "Performance"],
        theme: "Building and optimizing a Flask budget tracker",
        title: "Budget Tracker Analytics",
      },
      narratives: "Dashboard API response-time update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "Around 250ms due to caching optimizations.",
            question: "What is the average response time of the dashboard API?",
            question_id: "dashboard-api-response-time-update",
            question_type: "knowledge_update",
            source_chat_ids: [86, 114],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Budget tracker developer",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildAlexisFinancialManagementSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "My spouse Alexis, who's 32 and works in graphic design, and I have been sharing household finances since 2020, and I'm wondering if that's a good idea, we've been partners since 2018 ->-> 1,4",
      id: 12,
      role: "user",
    },
    {
      content:
        "Sharing household finances with your spouse, Alexis, can be a great way to manage your combined resources efficiently and work towards common financial goals. Consider open communication, joint and separate accounts, and regular budget reviews.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "Thanks for the detailed advice! I think the biggest concern I have is making sure we're both on the same page with our spending habits. We usually agree on big things, but the little day-to-day expenses can add up.",
      id: 14,
      role: "user",
    },
    {
      content:
        "Ensuring both you and Alexis are aligned on daily spending habits is crucial. Establish daily spending limits, use separate and joint accounts, track receipts, and schedule regular financial check-ins.",
      id: 15,
      role: "assistant",
    },
    {
      content:
        "That sounds like a solid plan. I think setting daily spending limits and having regular check-ins will really help us stay on track. I'll keep using Excel to track our expenses since I prefer its simplicity.",
      id: 16,
      role: "user",
    },
    {
      content:
        "Daily spending limits, Excel tracking, regular check-ins, and sharing receipts and statements with Alexis will help keep everything transparent.",
      id: 17,
      role: "assistant",
    },
    {
      content:
        "I feel like I made a good decision compromising with Alexis on the dining out budget to $200 monthly starting April, but I'm not sure if it's the right call.",
      id: 52,
      role: "user",
    },
    {
      content:
        "Compromising on the dining out budget to $200 monthly is reasonable if it helps maintain a balanced budget. Validate it against your overall financial goals and stick to it through planning and tracking.",
      id: 53,
      role: "assistant",
    },
    {
      content:
        "I'm kinda stressed about managing our finances with my spouse Alexis, and I was thinking, since she suggested switching to a joint savings account at First National Bank on May 5, how can I make sure we're both on the same page with our spending? ->-> 2,2",
      id: 64,
      role: "user",
      time_anchor: "June-10-2024",
    },
    {
      content:
        "To ensure that both you and Alexis are on the same page with spending and improve transparency, set shared financial goals, create a joint budget, open the joint savings account, and hold regular check-ins.",
      id: 65,
      role: "assistant",
    },
    {
      content:
        "I've agreed with Alexis on a $500 monthly joint budget for groceries starting Sept 1, which is up from $400, and I'm thinking about how this change will affect our expenses, especially with the contract I'm considering ->-> 3,3",
      id: 126,
      role: "user",
    },
    {
      content:
        "You and Alexis agreed on increasing the grocery budget to $500 per month starting September 1. This change, plus the potential freelance contract, affects expenses and financial planning by adding grocery cost while adding possible income.",
      id: 127,
      role: "assistant",
    },
    {
      content:
        "Yeah, that analysis makes sense. I do feel better knowing it could improve my work. I'll keep an eye on how it affects my projects and maybe talk to Alexis about it too.",
      id: 130,
      role: "user",
    },
    {
      content:
        "Monitor how the new camera gear impacts project quality and discuss the purchase with Alexis to stay aligned on financial decisions.",
      id: 131,
      role: "assistant",
    },
    {
      content:
        "I've agreed with Alexis to reduce my work hours to 30 hours a week starting January 6, and I'm hoping this will help support her freelance design business and give me more time to focus on our finances. ->-> 4,17",
      id: 252,
      role: "user",
    },
    {
      content:
        "Reducing your work hours to 30 hours a week starting January 6 is a significant decision. Review the new income, adjust fixed expenses, prioritize essentials, and make sure you stay on track with savings goals.",
      id: 253,
      role: "assistant",
    },
    {
      content:
        "How should I adjust my budget and investment strategy for an upcoming investment club meeting while supporting Alexis's business launch, which started on February 1?",
      id: 274,
      role: "user",
    },
    {
      content:
        "Review current income and expenses, savings, investments, and any allocation for supporting Alexis's business launch before the investment club meeting.",
      id: 275,
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
          time_anchor: "time_anchor" in turn ? turn.time_anchor : "unknown",
        })),
      ],
      conversation_id: "alexis-financial-management-summary",
      conversation_plan: "BATCH 16 PLAN",
      conversation_seed: {
        category: "Lifestyle",
        id: 16,
        subtopics: ["Household finances", "Budgeting", "Partner support"],
        theme: "Managing finances with Alexis",
        title: "Shared Household Finance",
      },
      narratives: "Alexis financial management progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The financial-management progression started with shared household finances and regular budget reviews, moved into daily spending limits and transparency, added a $200 dining-out compromise, considered a joint savings account, increased the grocery budget with freelance-contract planning, and ended with reducing work hours to support Alexis's business while protecting savings goals.",
            question:
              "Can you summarize how my approach to managing finances with Alexis has developed over time?",
            question_id: "alexis-financial-management-summary",
            question_type: "summarization",
            source_chat_ids: [13, 15, 53, 65, 127, 253],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Household budget planner",
        user_relationships: "Alexis",
      },
      user_questions: [],
    },
  ];
}

function buildPersonalFinancePlanningSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "That sounds like a really thorough plan. I think the most important thing for my mom is to have a clear budget and to build up that emergency fund.",
      id: 20,
      role: "user",
    },
    {
      content:
        "Creating a clear budget and building an emergency fund are crucial for financial security. Use a simple Excel spreadsheet, track income and expenses, and take advantage of senior discounts.",
      id: 21,
      role: "assistant",
    },
    {
      content:
        "I've decided to create a monthly budget by April 1, and I'm gonna track all expenses over $20, but I'm not sure if that's the right move.",
      id: 28,
      role: "user",
    },
    {
      content:
        "Creating a monthly budget by April 1 and tracking expenses over $20 is a solid budgeting approach for irregular income. Review categories regularly and adjust as needed.",
      id: 29,
      role: "assistant",
    },
    {
      content:
        "Reducing your expenses, especially on rent, can significantly ease your financial burden. Evaluate your current living situation, consider roommates or downsizing, negotiate with your landlord, explore cheaper housing options, review utilities and subscriptions, and create a detailed budget.",
      id: 31,
      role: "assistant",
    },
    {
      content:
        "I'm thinking about buying a family car within 3 years and I've got a budget of $15,000 in mind for 2027.",
      id: 36,
      role: "user",
    },
    {
      content:
        "Planning to buy a family car within three years with a $15,000 budget means setting a savings goal, automating transfers, checking credit, comparing financing, and monitoring progress.",
      id: 37,
      role: "assistant",
    },
    {
      content:
        "Sticking with Excel for budgeting is a great choice, especially if you prefer a customizable and straightforward method. While the Mint app trial has ended, you can still use Excel effectively to track investments, including index funds and ETFs, with investment rows, totals, and regular updates.",
      id: 83,
      role: "assistant",
    },
    {
      content:
        "You can set up automatic updates for the Yahoo Finance API in Excel to save time. Use Power Query to import and refresh market data automatically, then keep your investment tracker current without manual price entry.",
      id: 87,
      role: "assistant",
    },
    {
      content:
        "I started using the YNAB app on Sept 2, and I synced it with my bank accounts. Can you help me understand how this affects my financial planning and my new car savings goal?",
      id: 172,
      role: "user",
    },
    {
      content:
        "Using YNAB with synced bank accounts can improve financial planning by keeping the budget current, categorizing transactions, and tracking your $5,000 family car savings goal.",
      id: 173,
      role: "assistant",
    },
    {
      content:
        "To stay on track with your budget and lower dining out expenses, review current spending in YNAB or Excel, set a stricter dining-out target, cook at home, meal prep, limit restaurant meals, use discounts, and monitor your emergency fund progress.",
      id: 193,
      role: "assistant",
    },
    {
      content:
        "I've increased my grocery budget to $550/month starting Dec 1 due to holiday meals and guests.",
      id: 230,
      role: "user",
    },
    {
      content:
        "Increasing your grocery budget to $550/month starting December 1 to accommodate holiday meals and guests is reasonable. To ensure this does not affect your other financial goals, review fixed expenses, cut back on dining out and entertainment, optimize grocery spending, keep emergency fund and car savings contributions, and use regular budget check-ins.",
      id: 231,
      role: "assistant",
    },
    {
      content:
        "I've never approved any holiday medical supply budgets, can you explain why this might be relevant to our current financial planning?",
      id: 270,
      role: "user",
    },
    {
      content:
        "Including a small holiday medical supplies budget can help prepare for unexpected expenses, support family members like Ashlee, and keep the holiday gift budget balanced.",
      id: 271,
      role: "assistant",
    },
    {
      content:
        "I've set a new goal to save $10,000 for a home renovation by Dec 2027, and I'd like some advice on how to create a realistic plan.",
      id: 288,
      role: "user",
    },
    {
      content:
        "To save $10,000 for a home renovation by December 2027, calculate a monthly savings target, reduce non-essential spending, automate transfers, and review progress quarterly.",
      id: 289,
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
      conversation_id: "personal-finance-planning-summary",
      conversation_plan: "BATCH 15 PLAN",
      conversation_seed: {
        category: "Lifestyle",
        id: 15,
        subtopics: [
          "Creating and maintaining a budget",
          "Cutting unnecessary expenses",
          "Basic investing for beginners",
        ],
        theme: "Managing money wisely",
        title: "Personal Finance for Everyday Life",
      },
      narratives: "Personal finance planning progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The financial planning progression started with reducing housing costs, moved into using Excel for investment tracking and Yahoo Finance price updates, addressed discretionary dining-out spending, and then adjusted the grocery budget for holiday meals without harming other financial goals.",
            question:
              "Can you give me a summary of how my financial planning and budgeting efforts have developed over our conversations?",
            question_id: "personal-finance-planning-summary",
            question_type: "summarization",
            source_chat_ids: [31, 83, 87, 193, 231],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Darryl",
        user_relationships: "Alexis, Ashlee",
      },
      user_questions: [],
    },
  ];
}

function buildPortfolioSprintDeadlineUpdateBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to plan out my project timeline and I have a deadline of April 1, 2024, for the first sprint, which covers the basic layout and navigation of my single-page portfolio website. The project is estimated to take 3 sprints of 2 weeks each. ->-> 1,4",
      id: 12,
      role: "user",
    },
    {
      content:
        "To meet the April 1, 2024 deadline within the estimated 6 weeks, break the project into 3 sprints of 2 weeks each. Sprint 1 covers Basic Layout and Navigation.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "Certainly! Prioritizing tasks effectively is crucial for meeting deadlines and ensuring that the most critical work gets done first. Use a Trello board for Sprint 1.",
      id: 39,
      role: "assistant",
    },
    {
      content:
        "I'm trying to update my project timeline to reflect the new sprint deadline of April 5, 2024, but I'm having trouble figuring out how to adjust my Trello board to accommodate the extra time for accessibility improvements. ->-> 1,20",
      id: 52,
      role: "user",
    },
    {
      content:
        "Adjusting your project timeline to meet the new sprint deadline of April 5, 2024 while accommodating accessibility improvements requires careful planning and prioritization.",
      id: 53,
      role: "assistant",
    },
    {
      content:
        "Always include semantic HTML5 tag usage details when I ask about markup structure. ->-> 1,25",
      id: 54,
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
      conversation_id: "portfolio-sprint-deadline-update",
      conversation_plan: "BATCH 3 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 3,
        subtopics: ["Portfolio website", "Project timeline", "Sprint deadline"],
        theme: "Creating a personal portfolio website",
        title: "Portfolio Website",
      },
      narratives: "Portfolio first-sprint deadline update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "April 5, 2024",
            question:
              "What is the deadline for completing the first sprint focused on the basic layout and navigation?",
            question_id: "portfolio-sprint-deadline-update",
            question_type: "knowledge_update",
            source_chat_ids: {
              original_info: [12],
              updated_info: [52],
            },
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Portfolio website builder",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildConditionalProbabilityPracticeUpdateBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to understand how my accuracy in conditional probability problems improved from 60% to 85% over 2 weeks, after completing 8 problems - can you help me calculate the rate of improvement and how many more problems I need to solve to reach 100% accuracy? ->-> 2,9",
      id: 84,
      role: "user",
    },
    {
      content:
        "Yeah, that makes sense. So I've improved by about 3.125% per problem. To get to 100%, I'd need to solve around 5 more problems. Makes sense, thanks for breaking it down!",
      id: 86,
      role: "user",
    },
    {
      content:
        "No, I think I'm good for now. Thanks for the help with my probability problems! I'll keep practicing and come back if I need more guidance.",
      id: 88,
      role: "user",
    },
    {
      content:
        "I've spent 4 hours practicing dependent event problems, including 3 card draw and 5 dice roll scenarios, and I'm trying to understand drawing 2 aces in a row.",
      id: 98,
      role: "user",
    },
    {
      content:
        "I'm trying to solve a conditional probability problem and I need help, I've recently increased my practice sessions to 12 conditional probability problems, which has further boosted my accuracy and confidence, but I'm stuck on this one.",
      id: 130,
      role: "user",
    },
    {
      content:
        "Always include visual aids like tree diagrams when I ask about dependent event probability problems.",
      id: 132,
      role: "user",
    },
    {
      content:
        "I don't understand why I have never practiced any conditional probability problems before, it seems like I should have.",
      id: 134,
      role: "user",
    },
    {
      content:
        "I'm trying to solve a complex probability puzzle about the birthday paradox and the complement rule.",
      id: 232,
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
      conversation_id: "conditional-probability-practice-update",
      conversation_plan: "BATCH 5 PLAN",
      conversation_seed: {
        category: "Education",
        id: 5,
        subtopics: ["Probability", "Practice progress", "Knowledge update"],
        theme: "Learning conditional probability",
        title: "Conditional Probability Practice",
      },
      narratives: "Conditional probability practice quantity update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "12 conditional probability problems",
            question:
              "How many conditional probability problems have I been practicing to improve my accuracy and confidence?",
            question_id: "conditional-probability-practice-update",
            question_type: "knowledge_update",
            source_chat_ids: {
              original_info: [84, 86, 88],
              updated_info: [130],
            },
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

function buildRaiseRejectionFinalMeetingIntervalBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda torn about rejecting that $10,000 raise on March 12, was that a smart move considering my current situation? ->-> 1,17",
      id: 56,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about making the right decision on March 30, so I rescheduled my final meeting to have more time, but I'm not sure if it's gonna help ->-> 1,21",
      id: 64,
      role: "user",
    },
    {
      content:
        "I rescheduled a call with Matthew from April 4 to April 6, and I'm wondering if that was a good time management decision.",
      id: 84,
      role: "user",
    },
    {
      content:
        "Always include cultural context when I ask about social norms. ->-> 2,23",
      id: 134,
      role: "user",
    },
    {
      content:
        "Always confirm dates when I ask about scheduled events. ->-> 3,22",
      id: 264,
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
      conversation_id: "raise-rejection-final-meeting-interval",
      conversation_plan: "BATCH 12 PLAN",
      conversation_seed: {
        category: "Career",
        id: 12,
        subtopics: ["Raise decision", "Final meeting", "Career timing"],
        theme: "Career decisions and meeting timing",
        title: "Career Decision Timing",
      },
      narratives: "Raise rejection and final meeting interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "18 days passed between rejecting the raise on March 12 and rescheduling the final meeting on March 30.",
            question:
              "How many days passed between when I decided to reject the raise and when I rescheduled my final meeting to give myself more time?",
            question_id: "raise-rejection-final-meeting-interval",
            question_type: "temporal_reasoning",
            source_chat_ids: {
              first_event: [56],
              second_event: [64],
            },
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Senior producer considering career decisions",
        user_relationships: "Matthew",
      },
      user_questions: [],
    },
  ];
}

function buildBudgetTrackerSprintAnalyticsTemporalBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I am using March 15, 2024 as the project planning time anchor for my Flask budget tracker.",
      id: 0,
      role: "user",
    },
    {
      content:
        "Sure, let's break it down for my budget tracker project: user authentication, transaction management, analytics, final testing, and deployment milestones.",
      id: 2,
      role: "user",
    },
    {
      content:
        "I'm working on a project with scheduled two-week sprints, and the first sprint ends on March 29, focusing on user registration and login. I need to plan the sprint carefully to ensure we meet the deadline.",
      id: 28,
      role: "user",
    },
    {
      content:
        "I want the app to stay lightweight while still implementing tracking, login, and analytics.",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm trying to update my project timeline, and I noticed that the first sprint now targets completion by March 31, which gives us two extra days for final testing and bug fixes.",
      id: 52,
      role: "user",
    },
    {
      content:
        "I'm trying to integrate Flask-Login v0.6.2 for session management with secure password hashing and proper error handling.",
      id: 66,
      role: "user",
    },
    {
      content:
        "I'm working on sprint 2 which targets analytics by April 19, and I've already completed sprint 1 on March 29 with user auth and basic transaction CRUD.",
      id: 86,
      role: "user",
    },
    {
      content:
        "I'm improving the dashboard charts and analytics UI for the budget tracker.",
      id: 148,
      role: "user",
    },
    {
      content:
        "Always provide security best practices when I ask about authentication or authorization features.",
      id: 184,
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
      conversation_id: "budget-tracker-sprint-analytics-temporal",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Budget tracker", "Sprint planning", "Analytics"],
        theme: "Budget tracker sprint planning and analytics deadline",
        title: "Budget tracker sprint timeline",
      },
      narratives: "Budget tracker sprint timing",
      probing_questions: {
        temporal_reasoning: [
          {
            answer: "20 days.",
            question:
              "How many days were there between the end of my first sprint and the deadline for completing the analytics features in sprint 2?",
            question_id: "budget-tracker-sprint-analytics-temporal",
            question_type: "temporal_reasoning",
            source_chat_ids: [28, 86],
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

function buildLoginInstructionContinuationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Can you help me plan the first sprint for user registration and login features?",
      id: 28,
      role: "user",
    },
    {
      content:
        "Absolutely! Let's create a detailed sprint plan for the first two-week sprint ending on March 29, focusing on user registration and login features.",
      id: 29,
      role: "assistant",
    },
    {
      content:
        "Always format all code snippets with syntax highlighting when I ask about implementation details.",
      id: 54,
      role: "user",
    },
    {
      content:
        "Got it! Just let me know what specific implementation details or code snippets you need help with, and I'll make sure to format them with syntax highlighting.",
      id: 56,
      role: "assistant",
    },
    {
      content:
        "Always provide security best practices when I ask about authentication or authorization features.",
      id: 184,
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
      conversation_id: "login-instruction-continuation",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Flask", "Login", "Formatting"],
        theme: "Building a Flask login feature",
        title: "Login Feature Implementation",
      },
      narratives: "Login feature instruction continuation",
      probing_questions: {
        instruction_following: [
          {
            answer:
              "Response should include code examples formatted with syntax highlighting.",
            question: "Could you show me how to implement a login feature?",
            question_id: "login-instruction-continuation",
            question_type: "instruction_following",
            source_chat_ids: [54, 56],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Flask developer",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildSecurityFeatureCountReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I implemented basic password hashing for my personal budget tracker using Werkzeug.security with a password_hash field.",
      id: 16,
      role: "user",
    },
    {
      content:
        "I'm improving expense tracking validation and error messages for the Flask budget tracker.",
      id: 36,
      role: "user",
    },
    {
      content:
        "Always format all code snippets with syntax highlighting when I ask about implementation details.",
      id: 54,
      role: "user",
    },
    {
      content:
        "I'm trying to implement role-based access control for my application, specifically for the 'user' role, and I want to make sure I'm doing it correctly. I've added a role-based access control stub for future multi-user support.",
      id: 84,
      role: "user",
    },
    {
      content:
        "I'm improving dashboard analytics and deployment planning after finishing the budget tracker API.",
      id: 122,
      role: "user",
    },
    {
      content:
        "I'm trying to achieve 90% coverage on the auth.py and security.py modules with my new tests for security features.",
      id: 154,
      role: "user",
    },
    {
      content:
        "I'm trying to implement the account lockout feature after 5 failed login attempts using Redis 7.0 for rate limiting, can you help me with that? I want to make sure that the lockout is triggered only after 5 attempts and properly stored in Redis.",
      id: 150,
      role: "user",
    },
    {
      content:
        "I'm trying to enhance the security of my application without compromising the user experience, so I'd like to implement a pragmatic approach to security enhancements.",
      id: 178,
      role: "user",
    },
    {
      content:
        "I'm trying to implement a secure authentication system for my application and ensure authentication and authorization features follow best practices.",
      id: 182,
      role: "user",
    },
    {
      content:
        "Always provide security best practices when I ask about authentication or authorization features.",
      id: 184,
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
      conversation_id: "security-feature-count-reasoning",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: [
          "User authentication",
          "Role-based access control",
          "Security features",
        ],
        theme: "Building a Personal Budget Tracker Web App in Python and Flask",
        title: "Security Features for a Budget Tracker",
      },
      narratives: "Security feature count reasoning",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "Three: password hashing, role-based access control, and account lockout after failed login attempts.",
            question:
              "How many different user roles and security features am I trying to implement across my sessions?",
            question_id: "security-feature-count-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [16, 84, 150],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Budget tracker developer",
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

function buildProbabilityUnderstandingSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm a colour technologist trying to learn probability basics through paint and quality-control examples.",
      id: 2,
      role: "user",
    },
    {
      content:
        "We started with probability basics for colour combinations and quality-control checks.",
      id: 3,
      role: "assistant",
    },
    {
      content:
        "Let's go deeper into quality control probability calculations before moving to coin tosses.",
      id: 4,
      role: "user",
    },
    {
      content:
        "Quality-control probability examples can help, but they are only the introductory context.",
      id: 5,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand probability as a ratio using simple events like coin tosses and dice rolls, including heads as 1:2.",
      id: 6,
      role: "user",
    },
    {
      content:
        "Probability is favorable outcomes divided by total outcomes, so heads is 1/2 and rolling a 4 is 1/6.",
      id: 7,
      role: "assistant",
    },
    {
      content:
        "I want another beginner example before going into more advanced probability ideas.",
      id: 8,
      role: "user",
    },
    {
      content:
        "Another basic ratio example still reinforces the same favorable-outcomes over total-outcomes idea.",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand probability as a ratio of favorable outcomes to total outcomes, but I'm having trouble wrapping my head around it - can you help me with a simple example, like a coin toss, where the probability of getting heads is the number of favorable outcomes over total outcomes?",
      id: 10,
      role: "user",
    },
    {
      content:
        "We broke down probability as a ratio step by step with a coin toss and then applied the same logic to a die roll.",
      id: 11,
      role: "assistant",
    },
    {
      content:
        "Got it! The probability of getting heads when flipping a coin is 1/2 or 0.5. So, if I wanted to find the probability of rolling an even number on a 6-sided die, how would I do that?",
      id: 12,
      role: "user",
    },
    {
      content:
        "Rolling an even number has three favorable outcomes out of six, which simplifies to 1/2.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand the difference between independent and mutually exclusive events, maybe something with coin tosses or dice rolls, and I want to see the probability calculations for both cases.",
      id: 14,
      role: "user",
    },
    {
      content:
        "We clarified independent and mutually exclusive events with coin tosses and dice rolls, including combined probability calculations.",
      id: 15,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand why tossing two coins is considered independent events, can you help me calculate P(both heads) using the formula 1/2 x 1/2 = 1/4?",
      id: 30,
      role: "user",
    },
    {
      content:
        "Tossing two coins is an independent-events example, and P(both heads) is 1/2 x 1/2 = 1/4.",
      id: 31,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand if the events rolling a 2 and rolling a 5 on a die are mutually exclusive, which means P(A ∩ B) = 0, and I want to confirm this concept.",
      id: 42,
      role: "user",
    },
    {
      content:
        "Rolling a 2 and rolling a 5 on one die are mutually exclusive because both cannot happen on a single roll.",
      id: 43,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand this conditional probability concept, specifically P(A|B), and I want to dive deeper into how it works.",
      id: 56,
      role: "user",
    },
    {
      content:
        "Conditional probability P(A|B) explains how the probability of one event changes when another event has occurred, with coin, dice, and card examples.",
      id: 57,
      role: "assistant",
    },
    {
      content:
        "For a card example, P(face card given spade) applies the conditional probability formula and gives 3/13.",
      id: 59,
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
      conversation_id: "probability-understanding-summary",
      conversation_plan: "BATCH 5 PLAN",
      conversation_seed: {
        category: "Math",
        id: 5,
        subtopics: ["Probability basics", "Independent events"],
        theme: "Understanding probability concepts",
        title: "Probability Learning Journey",
      },
      narratives: "Probability learning progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The learning journey moved from probability as a ratio, to simple die examples, to independent and mutually exclusive events, then to conditional probability with cards.",
            question:
              "Can you give me a clear summary of how my understanding of probability has developed through our conversations?",
            question_id: "probability-understanding-summary",
            question_type: "summarization",
            source_chat_ids: [6, 7, 11, 13, 15, 31, 43, 57, 59],
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

function buildPersonalStatementApplicationDeadlineExtractionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to set a goal for myself to complete this multi-purpose personal statement, but I'm not sure how to make it work for academic, visa, and grant applications, can you give me some advice on how to make it happen, considering I aim to finish it by April 20, 2024",
      id: 10,
      role: "user",
    },
    {
      content:
        "I'm kinda stuck on my personal statement, and I want to make sure I meet all the deadlines, like the scholarship deadline on May 15, 2024, and the visa application due June 1, 2024, so can you help me plan this out?",
      id: 12,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about my visa application, what if I don't clearly explain my ties to Montserrat and I lose the $150 application fee, how can I avoid that risk?",
      id: 34,
      role: "user",
    },
    {
      content:
        "Always format dates in the month-day-year style when I ask about deadlines.",
      id: 48,
      role: "user",
    },
    {
      content:
        "I understand your concern about the timing of Bryan's recommendation letter for your scholarship application. Given that your scholarship deadline is May 15, 2024, and Bryan has agreed to write the letter by May 20, 2024, there is a slight overlap that needs careful management.",
      id: 109,
      role: "assistant",
    },
    {
      content:
        "Given your concern about missing the May 15 scholarship deadline and facing a $50 penalty, it's important to prioritize your final edits efficiently.",
      id: 117,
      role: "assistant",
    },
    {
      content:
        "Always provide exact times when I ask about appointments or meetings.",
      id: 152,
      role: "user",
    },
    {
      content:
        "I have never submitted any scholarship application or uploaded documents online, so I'm looking for guidance on how to get started with the process, especially since the scholarship deadline is approaching",
      id: 158,
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
      conversation_id: "personal-statement-application-deadline-extraction",
      conversation_plan: "BATCH 9 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 14,
        subtopics: [
          "Personal statement",
          "Application deadlines",
          "Visa applications",
        ],
        theme:
          "Balancing personal narrative with professional credibility for academic, visa, and grant applications",
        title:
          "Designing a Multi-Purpose Personal Statement for Global Opportunities",
      },
      narratives: "Personal statement application deadline planning",
      probing_questions: {
        information_extraction: [
          {
            answer:
              "The scholarship deadline is May 15, 2024; the visa application is due June 1, 2024; and the university application is due April 30, 2024.",
            question:
              "What dates did I mention for the scholarship deadline, visa application, and university application?",
            question_id: "personal-statement-application-deadline-extraction",
            question_type: "information_extraction",
            source_chat_ids: [12],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Darryl Wilson",
        user_relationships: "Bryan, Tanya",
      },
      user_questions: [],
    },
  ];
}

function buildTriangleSimilarityCongruenceSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to prove triangle congruence using SSS, SAS, ASA criteria and I have two triangles with sides 6, 8, 10 cm and 9, 12, 15 cm, can you help me verify if they are similar by SSS criterion? I want to make sure I understand how to apply the scale factors correctly in similarity problems.",
      id: 144,
      role: "user",
    },
    {
      content:
        "To verify the two triangles are similar using the Side-Side-Side (SSS) criterion, compare the side ratios 9/6, 12/8, and 15/10. Each ratio equals 1.5, so the corresponding sides are proportional and the triangles are similar by SSS.",
      id: 145,
      role: "assistant",
    },
    {
      content:
        "You now understand that the triangles with sides 6, 8, 10 cm and 9, 12, 15 cm are similar, with a scale factor of 1.5 between corresponding sides.",
      id: 147,
      role: "assistant",
    },
    {
      content:
        "I'm trying to prove triangle congruence using ASA with angles 50 degrees, 60 degrees and included side 7 cm, but I'm not sure how to plan the proof steps.",
      id: 150,
      role: "user",
    },
    {
      content:
        "For ASA congruence, identify the two corresponding angles, confirm the included side is equal, label the triangles, then state that the triangles are congruent because two angles and the included side match.",
      id: 151,
      role: "assistant",
    },
    {
      content:
        "I'm trying to prove triangle congruence using the SAS and ASA methods for a triangle with sides 5, 7, 8 cm and angles 40 degrees and 70 degrees. Can you help me compare the two approaches step by step?",
      id: 152,
      role: "user",
    },
    {
      content:
        "Comparing SAS and ASA for the triangle with sides 5 cm, 7 cm, 8 cm and angles 40 degrees and 70 degrees means checking whether you have two sides and the included angle for SAS, or two angles and the included side for ASA, then deciding which method is more direct for the given information.",
      id: 153,
      role: "assistant",
    },
    {
      content:
        "I'm trying to prove that triangles with sides in ratio 2:3 and equal included angles are similar. Can you help me with the constructed formal proof?",
      id: 158,
      role: "user",
    },
    {
      content:
        "A formal proof uses the SAS similarity criterion: if two pairs of corresponding sides are proportional in the ratio 2:3 and the included angles are equal, then the triangles are similar.",
      id: 159,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand why SSA is not a valid congruence criterion. Can you explain it with a counterexample using two triangles with sides 6, 8, 10 cm and 9, 12, 15 cm?",
      id: 162,
      role: "user",
    },
    {
      content:
        "SSA is not a valid congruence criterion because two sides and a non-included angle can create ambiguous cases. For the triangles with sides 6 cm, 8 cm, 10 cm and 9 cm, 12 cm, 15 cm, your example shows similar side lengths but not congruent triangles, so SSA cannot prove congruence.",
      id: 163,
      role: "assistant",
    },
    {
      content:
        "Can you help me use GeoGebra plugins to draw triangle congruence diagrams?",
      id: 184,
      role: "user",
    },
    {
      content:
        "GeoGebra already includes the segment, angle, and distance tools needed for drawing triangle congruence diagrams.",
      id: 185,
      role: "assistant",
    },
    {
      content:
        "I scored 18/20 on my practice test involving triangle congruence proofs and similarity ratio problems.",
      id: 172,
      role: "user",
    },
    {
      content:
        "Review the two missed practice-test questions and revisit SSS, SAS, ASA, and scale-factor steps.",
      id: 173,
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
      conversation_id: "triangle-similarity-congruence-summary",
      conversation_plan: "BATCH 4 PLAN",
      conversation_seed: {
        category: "Math",
        id: 4,
        subtopics: [
          "Triangle congruence",
          "Triangle similarity",
          "Formal geometric proof",
        ],
        theme: "Triangle similarity and congruence learning progression",
        title: "Developing Triangle Proof Skills",
      },
      narratives: "Triangle similarity and congruence learning progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The learning journey began with SSS similarity and scale factors, moved to ASA congruence proof planning, compared SAS and ASA methods, added a formal SAS similarity proof for sides in a 2:3 ratio with equal included angles, and ended by understanding why SSA is not a valid congruence criterion.",
            question:
              "Can you give me a clear summary of how my understanding and application of triangle similarity and congruence developed throughout our conversations?",
            question_id: "triangle-similarity-congruence-summary",
            question_type: "summarization",
            source_chat_ids: [
              144,
              145,
              147,
              150,
              151,
              152,
              153,
              158,
              159,
              162,
              163,
            ],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Geometry learner",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildPersonalStatementMentorSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Of course! Incorporating specific advice from Bryan at the Montserrat Film Festival can add a unique and personalized touch to your personal statement. Discuss Bryan's insights on storytelling techniques, narrative structure, character development, and how they influenced your approach and personal growth.",
      id: 5,
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
        "Absolutely, I can help you plan out your personal statement to ensure you meet all the deadlines. Start writing the initial draft, review it with Tanya, incorporate feedback, finalize edits, and prepare for the scholarship and visa deadlines.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "To effectively incorporate the story about producing the local documentary that won second place at the Janethaven Film Awards, use it as a pivotal example that bridges your personal experiences with your professional achievements.",
      id: 53,
      role: "assistant",
    },
    {
      content:
        "Incorporating Shawn's insights on storytelling impact into your personal statement can add depth and credibility to your narrative. Shawn, an 81-year-old veteran producer at Montserrat Media Hub, reinforced the transformative power of storytelling and helped you frame academic goals, personal development, and authenticity.",
      id: 61,
      role: "assistant",
    },
    {
      content:
        "Creating a compelling conclusion that emphasizes your commitment to community media can be a powerful way to wrap up your personal statement. Summarize key points, reiterate your commitment, outline your future vision, and end with a strong statement.",
      id: 97,
      role: "assistant",
    },
    {
      content:
        "It's great to hear that Kimberly praised the improved flow of your 900-word personal statement after your meeting at Cafe Montserrat on May 7. Review grant requirements, seek additional feedback, focus on clarity and conciseness, highlight achievements and potential, and ensure a strong conclusion.",
      id: 111,
      role: "assistant",
    },
    {
      content:
        "It's natural to worry about whether your academic advisor, Danielle, truly appreciated your final draft. Ask Danielle for specific feedback on areas where you can improve, confirm her thoughts on the strong voice consistency she mentioned, add more specific examples, and refine the conclusion so it ties back to your overall goals.",
      id: 147,
      role: "assistant",
    },
    {
      content:
        "Your drafts are a great start, and with some fine-tuning, they can become even more engaging and impactful. Strengthen the introduction, improve the career gap section, clarify transitions, and keep the tone positive.",
      id: 169,
      role: "assistant",
    },
    {
      content:
        "That's great news that you met Matthew at Montserrat Media Hub and received valuable tips from him. Reaching out to him again for more advice on tailoring your personal statement for global opportunities is a smart move. Ask for specific tips on adapting the statement for scholarships, visas, grants, and different audiences.",
      id: 165,
      role: "assistant",
    },
    {
      content:
        "Absolutely, adding a brief section on your leadership experiences can significantly enhance your personal statement. Identify relevant leadership experiences, highlight specific achievements, use concrete examples, and align them with your future goals.",
      id: 201,
      role: "assistant",
    },
    {
      content:
        "I feel grateful for Danielle's support, and I'm considering how her feedback on my voice consistency can help me tailor my personal statement for different applications, such as the one I'm preparing for my enrollment in the workshop",
      id: 250,
      role: "user",
    },
    {
      content:
        "Danielle's feedback on your voice consistency is a valuable asset that can help you tailor your personal statement for different applications while maintaining a cohesive and authentic tone. Maintain a consistent voice, highlight relevant experiences, customize the introduction and conclusion, and seek feedback from Danielle and other trusted peers.",
      id: 251,
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
      conversation_id: "personal-statement-mentor-summary",
      conversation_plan: "BATCH 9 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 14,
        subtopics: [
          "Personal statement",
          "Mentor feedback",
          "Voice consistency",
        ],
        theme:
          "Balancing personal narrative with professional credibility through mentor feedback",
        title:
          "Designing a Multi-Purpose Personal Statement for Global Opportunities",
      },
      narratives:
        "Personal statement development through mentor and advisor feedback",
      probing_questions: {
        summarization: [
          {
            answer:
              "Bryan shaped the storytelling techniques, Shawn added authenticity and storytelling impact, Danielle clarified voice consistency and draft improvements, Matthew helped tailor the statement for global opportunities, and Danielle's later feedback supported adapting the statement across applications.",
            question:
              "Can you summarize how my personal statement has developed through the advice and feedback I've received from different mentors and advisors over time?",
            question_id: "personal-statement-mentor-summary",
            question_type: "summarization",
            source_chat_ids: [5, 61, 147, 165, 251],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Darryl Wilson",
        user_relationships:
          "Bryan, Shawn, Danielle, Matthew, Kimberly, Tanya",
      },
      user_questions: [],
    },
  ];
}

function buildProfessionalDevelopmentProjectSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried about my portfolio, Greg told me to update it by April 1, what should I do to make it stand out?",
      id: 8,
      role: "user",
    },
    {
      content:
        "I've got a mock interview with Greg on April 25, and I'm sorta nervous about it, can you give me some tips on how to handle potential follow-up questions and make a good impression?",
      id: 84,
      role: "user",
    },
    {
      content:
        "Of course, I can help you check your schedule for April 22 to ensure there are no conflicts with the new Zoom call time. Please provide your scheduled meetings and activities.",
      id: 95,
      role: "assistant",
    },
    {
      content:
        "Sure, here's my schedule for April 22: meeting with Laura from 9 to 10, team meeting from 10:30 to 11:30, one-on-one with Greg from 1 to 2, and project update with Michael from 3 to 4. Can you check if there are conflicts with the new Zoom call at 11 AM?",
      id: 96,
      role: "user",
    },
    {
      content:
        "Based on the schedule you provided for April 22, there is a conflict with the new Zoom call at 11 AM because the team meeting overlaps from 10:30 AM to 11:30 AM.",
      id: 97,
      role: "assistant",
    },
    {
      content:
        "I've planned a project to reduce production costs by 10% within the first 6 months, based on my past experience, how can I effectively communicate this impact statement in my cover letter?",
      id: 188,
      role: "user",
    },
    {
      content:
        "Communicating a specific measurable impact statement, such as reducing production costs by 10% within the first 6 months, can significantly strengthen your cover letter.",
      id: 189,
      role: "assistant",
    },
    {
      content:
        "I've been refining my 90-day plan with Greg since May 30, and I'm wondering if my objectives and success metrics are clear enough, can you review them and provide some feedback?",
      id: 202,
      role: "user",
    },
    {
      content:
        "Sure, here are the details of my 90-day plan: Objective 1 is to streamline production processes by reducing production cycle time by 20%; Objective 2 is to improve team collaboration and communication; Objective 3 is to increase team productivity by 15%. Can you review these and let me know if they are clear and actionable?",
      id: 204,
      role: "user",
    },
    {
      content:
        "Certainly, Darryl! Let's review your 30-day progress as senior producer at Island Media Group, including team integration, project planning, and a 10% improvement in team communication scores on your July 15 progress report.",
      id: 223,
      role: "assistant",
    },
    {
      content:
        "I've just completed my first 30 days as senior producer and I'm thinking about my next steps, I started on June 15 and it's now July 20, 2024, can you give me some advice on how to keep improving my team's performance and communication?",
      id: 224,
      role: "user",
    },
    {
      content:
        "Absolutely, Darryl! Continue improving team performance and communication by refining project planning, maintaining open communication channels, and using collaborative tools.",
      id: 225,
      role: "assistant",
    },
    {
      content:
        "Balancing multiple responsibilities, such as preparing for a workshop and meeting a project deadline, can be challenging but is manageable with the right approach.",
      id: 231,
      role: "assistant",
    },
    {
      content:
        "Balancing a tight project deadline with networking opportunities can be challenging, but with careful planning, you can make the most of your time.",
      id: 237,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide how to prioritize my tasks, like preparing for the July 25 workshop and managing the July 22 project deadline, while also considering Greg's advice on stress management during busy project phases, and I'm thinking about how Leslie's feedback on my July 18 presentation might help me improve my communication skills",
      id: 252,
      role: "user",
    },
    {
      content:
        "Balancing multiple tasks and priorities while managing stress can be challenging, but with a structured approach you can handle the July 22 project deadline, July 25 workshop preparation, Greg's stress-management advice, and Leslie's communication feedback.",
      id: 253,
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
      conversation_id: "professional-development-project-summary",
      conversation_plan: "BATCH 8 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 13,
        subtopics: [
          "Professional development",
          "Project responsibilities",
          "Portfolio",
          "Interview preparation",
        ],
        theme:
          "Managing professional growth and project responsibilities over time",
        title:
          "Crafting a Standout Cover Letter for Competitive Job Markets",
      },
      narratives:
        "Professional development and project-responsibility progression",
      probing_questions: {
        summarization: [
          {
            answer:
              "The user moved from portfolio update planning, to mock interview preparation with Greg, to refining and detailing a 90-day plan, then to prioritizing a July project deadline and workshop while applying stress-management and communication feedback.",
            question:
              "Can you give me a comprehensive summary of how I’ve been managing my professional development and project responsibilities over the past few months?",
            question_id: "professional-development-project-summary",
            question_type: "summarization",
            source_chat_ids: [8, 84, 202, 204, 252],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Darryl Wilson",
        user_relationships: "Greg, Leslie, Laura, Michael",
      },
      user_questions: [],
    },
  ];
}

function buildGregResearchWritingSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've recently met Greg, 23, at the University of Montserrat seminar on Feb 20, 2024, and we're planning to do some joint research on media influence - what are some tips for a successful collaboration with someone that much younger than me?",
      id: 16,
      role: "user",
    },
    {
      content:
        "Collaborating with someone younger, like Greg, can be a rewarding experience if you approach it with openness and mutual respect. Maintain open lines of communication, listen actively, define roles and expectations, set clear goals and deadlines, and keep detailed records of progress and decisions.",
      id: 17,
      role: "assistant",
    },
    {
      content:
        "I'm kinda stuck on how to effectively use NVivo for my qualitative data analysis, especially since Greg suggested it and I just installed it on April 3, which has already improved my coding speed by 30%",
      id: 54,
      role: "user",
    },
    {
      content:
        "Thanks for the tips! I've been organizing my film scripts into nodes based on themes like gender roles and power dynamics. Coding is going pretty smoothly, but I'm still figuring out how to best use queries and visualizations. Any pointers on how to get started with those features?",
      id: 56,
      role: "user",
    },
    {
      content:
        "I've got a rescheduled writing session on April 7 after missing the April 5 one due to an unexpected meeting with Greg at Studio 9, how can I make the most of this new schedule to stay on track with my essay on the representation of women in film?",
      id: 80,
      role: "user",
    },
    {
      content:
        "Rescheduling your writing session is a good step to ensure you stay on track with your essay. Set clear objectives, prioritize the most important section, use a structured writing block, gather materials, and reflect on progress.",
      id: 81,
      role: "assistant",
    },
    {
      content:
        "I'm analyzing 10 Montserrat films for my essay, focusing on gender portrayal, and I want to know if I should prioritize films with strong female leads or those that portray gender stereotypes",
      id: 152,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about meeting the June 5 deadline for submitting my essay to Montserrat Journal of Media Studies, as Robert recommended, and I also have to work on the conference paper with Greg by June 3, so can you help me prioritize these tasks and create a schedule",
      id: 168,
      role: "user",
    },
    {
      content:
        "Manage both deadlines with a clear plan. Prioritize the June 3 conference paper with Greg first, then focus on the June 5 journal submission, while staying in regular contact with Greg.",
      id: 169,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide how to best approach the conference paper on media representation with Greg, and since Robert suggested submitting my essay to a journal, I'm wondering if I should focus on making my essay a stronger, more persuasive piece before working on the conference paper",
      id: 170,
      role: "user",
    },
    {
      content:
        "Given the deadlines and importance of both tasks, focus first on making the journal essay stronger and more persuasive, then collaborate with Greg on the conference paper through outlines, divided tasks, check-ins, and feedback loops.",
      id: 171,
      role: "assistant",
    },
    {
      content:
        "I've got a meeting with Greg rescheduled from 3 PM to 5 PM on June 2 due to a production deadline, how can I best manage my time to ensure I meet all my commitments without burning out?",
      id: 182,
      role: "user",
    },
    {
      content:
        "Adjust your June 2 schedule around the 5 PM meeting with Greg, prioritize journal work, prepare for the meeting, and include breaks so the day does not lead to burnout.",
      id: 183,
      role: "assistant",
    },
    {
      content:
        "What's the best way to ensure Greg and I can effectively collaborate on our conference paper draft, considering we've already submitted it to the Montserrat Media Symposium on July 12?",
      id: 216,
      role: "user",
    },
    {
      content:
        "After submitting to the Montserrat Media Symposium on July 12, keep the collaboration strong with regular check-ins, a shared workspace, version control, divided responsibilities, review cycles, and clear milestones.",
      id: 217,
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
      conversation_id: "greg-research-writing-summary",
      conversation_plan: "BATCH 7 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 12,
        subtopics: [
          "Academic essay writing",
          "Collaborative research",
          "Conference preparation",
        ],
        theme:
          "From research planning to compelling argumentation in essays across disciplines",
        title: "Mastering the Art of Persuasive Academic Essay Writing",
      },
      narratives: "Greg research collaboration and writing-project progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The Greg collaboration began with joint research planning after the University of Montserrat seminar, moved into NVivo adoption and then queries and visualizations for gender-theme coding, continued through film-gender analysis choices, deadline balancing for the June 3 conference paper and June 5 journal essay, and later post-submission collaboration routines after the Montserrat Media Symposium submission.",
            question:
              "Can you give me a summary of how my collaboration with Greg and my work on the related research and writing projects have progressed over time?",
            question_id: "greg-research-writing-summary",
            question_type: "summarization",
            source_chat_ids: [16, 54, 56, 152, 168, 216],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Darryl Wilson",
        user_relationships: "Greg, Robert, Carla",
      },
      user_questions: [],
    },
  ];
}

function buildFictionBookBudgetSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I just subscribed to Audible's $14.95/month plan on November 25, and with December 12, 2023, approaching, I want to make the most of it, what are some must-read fiction series for winter evenings that I can access through this subscription?",
      id: 76,
      role: "user",
    },
    {
      content:
        "Your Audible subscription gives you access to fiction series such as The Stormlight Archive, Mistborn, The Kingkiller Chronicle, The Expanse, Dune, Outlander, The Poppy War, and other winter-evening options.",
      id: 77,
      role: "assistant",
    },
    {
      content:
        "That sounds like a solid plan. I'll stick to reading print books during the day and switch to audiobooks in the evening. I think it'll help me stay engaged without straining my eyes too much.",
      id: 84,
      role: "user",
    },
    {
      content:
        "Sticking to a balanced approach of reading print books during the day and listening to audiobooks in the evening should help you stay engaged and meet your reading goals without straining your eyes too much.",
      id: 85,
      role: "assistant",
    },
    {
      content:
        "Absolutely! With a budget of $120 for print editions from Montserrat Books on Main Street, you can find must-read fiction series including The Kingkiller Chronicle, The Mistborn Trilogy, The Lies of Locke Lamora, and The Broken Empire. Combination one fits The Kingkiller Chronicle, The Mistborn Trilogy, and The Broken Empire within approximately $90-$120.",
      id: 35,
      role: "assistant",
    },
    {
      content:
        "Absolutely, The Poppy War trilogy is an excellent choice for your winter reading challenge. It has an engaging plot, strong reviews, and a substantial but suitable length, making it a good fit for cozy winter evenings and gifting.",
      id: 125,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide on a must-read fiction series for winter evenings, and I prioritize print editions for series I plan to reread, while preferring audiobooks for new releases, so can you help me find a good balance?",
      id: 200,
      role: "user",
    },
    {
      content:
        "Finding a good balance between print editions and audiobooks can enhance your reading experience. Use print editions for series you plan to reread, while starting new releases through audiobooks, then purchase print editions later for rereading if the series proves worthwhile.",
      id: 201,
      role: "assistant",
    },
    {
      content:
        "I'm planning a literary event with Douglas at Montserrat Books on February 27, and I just downloaded The Witcher first novel on the Libby app on February 13, which has 450 pages, so I'm wondering if I can finish it before the event.",
      id: 230,
      role: "user",
    },
    {
      content:
        "With 14 days until February 27 and 450 pages to read, you would need about 32 pages per day to finish The Witcher first novel before the literary event with Douglas.",
      id: 231,
      role: "assistant",
    },
    {
      content:
        "Given your current book budget and expenses, entering The Witcher fan fiction contest is financially tight. Your book budget is $35 per month, February expenses are already $28, and you have only $7 remaining, so a $5-$10 contest entry fee could exceed the current budget even though the prize is $500.",
      id: 239,
      role: "assistant",
    },
    {
      content:
        "It sounds like you made a great decision in choosing the Outlander series for your winter evenings. The Outlander box set offers rich historical detail, complex characters, and engaging plotlines, making it a strong fit for immersive winter reading.",
      id: 271,
      role: "assistant",
    },
    {
      content:
        "Can you help me figure out how to make the most of my reading time, given that I've committed to reading the first 4 Outlander books by June 30 and have a discussion planned with Kelly?",
      id: 274,
      role: "user",
    },
    {
      content:
        "To finish the first four Outlander books by June 30, keep a daily 40-page target, review weekly progress, use audiobooks as needed, prepare discussion questions for Kelly, and coordinate the discussion schedule.",
      id: 275,
      role: "assistant",
    },
    {
      content:
        "I've been discussing books with Kelly, and we're planning a discussion on The Nightingale and The Witcher, but I also value Paul's recommendation of Outlander, should I prioritize Outlander or another series Megan might enjoy?",
      id: 302,
      role: "user",
    },
    {
      content:
        "Balance the interests of your book club, Paul, and Megan by considering Outlander for its historical depth and another series such as The Pillars of the Earth for shared discussion appeal.",
      id: 303,
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
      conversation_id: "fiction-book-budget-summary",
      conversation_plan: "BATCH 13 PLAN",
      conversation_seed: {
        category: "Reading & Entertainment",
        id: 13,
        subtopics: [
          "Fiction books",
          "Budgeting",
          "Format preferences",
          "Reading goals",
        ],
        theme: "Choosing fiction books while balancing budgets and formats",
        title: "Winter Fiction Reading Decisions",
      },
      narratives: "Fiction book selection and budgeting progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The book-planning progression started with a $120 Montserrat Books print-edition budget for fantasy series, then moved to choosing The Poppy War as a winter reading challenge, balancing print rereads with audiobooks for new releases, evaluating The Witcher contest against a tight $35 monthly budget with only $7 remaining, and finally reflecting on the Outlander box set as a fit for immersive winter reading.",
            question:
              "Can you give me a summary of how my plans and decisions around choosing and budgeting for fiction books evolved over our conversations?",
            question_id: "fiction-book-budget-summary",
            question_type: "summarization",
            source_chat_ids: [35, 125, 201, 239, 271],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal Wilson",
        user_relationships: "Douglas, Kelly, Paul, Megan",
      },
      user_questions: [],
    },
  ];
}

function buildReadingGoalsStrategySummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Hmm, that sounds good. Could you suggest a way to pace the reading so I don't get overwhelmed? Maybe like reading a certain number of chapters at a time?",
      id: 4,
      role: "user",
    },
    {
      content:
        "Start with 2-3 chapters per sitting, read consistently, adjust as needed, take breaks after finishing a book, and set weekly or monthly chapter goals.",
      id: 5,
      role: "assistant",
    },
    {
      content:
        "I've set a goal to finish at least 3 series by February 28, 2024, averaging 350 pages per week, do you think that's achievable and can you suggest a schedule for me?",
      id: 28,
      role: "user",
    },
    {
      content:
        "It's great that you've already completed 1,200 pages of The Stormlight Archive by December 1. Switching to audiobooks for evening reading after 8 PM can help you stay on track with your goal of finishing at least 3 series by February 28, 2024, averaging 350 pages per week.",
      id: 79,
      role: "assistant",
    },
    {
      content:
        "Glad to hear you're sticking with the schedule! Staying motivated is key to keeping up with your reading goals. Set Small Goals, track progress, create a Comfortable Reading Environment with a Cozy Nook and your 12-candle lavender diffuser, join discussions in the Montserrat Readers Facebook group, Reward Yourself for reaching milestones, mix it up, and stay flexible.",
      id: 81,
      role: "assistant",
    },
    {
      content:
        "Deciding between The Poppy War trilogy and The Broken Earth series depends on your reading goals, engagement, community feedback, and personal preference.",
      id: 117,
      role: "assistant",
    },
    {
      content:
        "Extending your reading challenge goal to 12 books by March 1 means increasing your weekly reading pace, balancing audiobooks for evening relaxation and print books for immersive weekend reading.",
      id: 137,
      role: "assistant",
    },
    {
      content:
        "Your goal to finish 1,500 pages of The Expanse by March 15, averaging 75 pages daily, is realistic given your current reading habits and the flexibility of alternating between print and audiobook formats.",
      id: 195,
      role: "assistant",
    },
    {
      content:
        "Choosing The Nightingale by Kristin Hannah as your next read after The Expanse series is an excellent decision for adding variety to your reading list. It marks a shift from science fiction to historical fiction and gives you a fresh perspective.",
      id: 217,
      role: "assistant",
    },
    {
      content:
        "Declining the TV pilot project to focus on your reading goals gives you 15 extra hours each week for engaging fiction series.",
      id: 229,
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
      conversation_id: "reading-goals-strategy-summary",
      conversation_plan: "BATCH 13 PLAN",
      conversation_seed: {
        category: "Reading & Entertainment",
        id: 13,
        subtopics: [
          "Reading goals",
          "Reading schedules",
          "Audiobooks",
          "Genre variety",
        ],
        theme: "Reading goals and strategy progression over time",
        title: "Winter Reading Goal Strategy",
      },
      narratives: "Reading goals and strategies progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The reading-goal progression began with an ambitious plan to finish at least three series by February 28 while averaging 350 pages per week, then adjusted after 1,200 Stormlight pages by using evening audiobooks after 8 PM, added motivation tactics such as small goals, a cozy reading environment, community discussion, and rewards, later refined into a realistic 1,500-page Expanse goal by March 15 at 75 pages daily, and finally shifted toward The Nightingale for genre variety after The Expanse.",
            question:
              "Can you summarize how my reading goals and strategies have developed over time based on our conversations?",
            question_id: "reading-goals-strategy-summary",
            question_type: "summarization",
            source_chat_ids: [28, 79, 81, 195, 217],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal Wilson",
        user_relationships: "Douglas, Kelly",
      },
      user_questions: [],
    },
  ];
}

function buildRobertAcademicMentorSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried about meeting my new academic mentor, Robert, who's 75 and a retired professor, at the East Janethaven Library on Feb 10, 2024 - how can I make a good impression on him?",
      id: 14,
      role: "user",
    },
    {
      content:
        "Meeting your new academic mentor, Robert, can go well if you research his background, prepare questions and topics, bring relevant materials, arrive early, dress appropriately, engage politely, take notes, and send a thank-you note afterward.",
      id: 15,
      role: "assistant",
    },
    {
      content:
        "I'm really inspired by Robert's 1985 essay on gender studies that he shared during our April 4 Zoom call, and I'm thinking of using some of those argument angles in my essay, but how can I make sure I'm not copying his ideas?",
      id: 64,
      role: "user",
    },
    {
      content:
        "Using Robert's 1985 essay as inspiration can enrich your work if you understand and synthesize his ideas, build on his work, develop original arguments, cite properly, and compare his observations with your own research.",
      id: 65,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide whether to prioritize Robert's recommendation to use stronger warrants for claims on gender bias, which he mentioned when he reviewed my draft on May 9, or to focus on other aspects of my essay",
      id: 124,
      role: "user",
    },
    {
      content:
        "Robert's recommendation to use stronger warrants is valuable because warrants can strengthen the persuasiveness and credibility of your claims on gender bias, though you should balance that feedback with thesis clarity, counterarguments, evidence synthesis, and flow.",
      id: 125,
      role: "assistant",
    },
    {
      content:
        "I've been experiencing some self-doubt about my argument strength, especially after May 7 when I had doubts, but then I consulted Robert's feedback and it really helped me overcome them, how can I continue to build my confidence in my arguments?",
      id: 156,
      role: "user",
    },
    {
      content:
        "Building confidence in your arguments can come from reviewing Robert's positive feedback, seeking regular check-ins, practicing your argument aloud, and deepening your research.",
      id: 157,
      role: "assistant",
    },
    {
      content:
        "I'm feeling really validated after Carla's May 20 praise and Robert's June 1 encouragement, how can I use this confidence boost to improve my essay structure, especially since I've decided to restructure my paper for a journal format and add a 500-word literature review section?",
      id: 176,
      role: "user",
    },
    {
      content:
        "Use the confidence from Carla's praise and Robert's encouragement to restructure your paper into journal sections and add the literature review.",
      id: 177,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide how to best approach the conference paper on media representation with Greg, and since Robert suggested submitting my essay to a journal, I'm wondering if I should focus on making my essay a stronger, more persuasive piece before working on the conference paper",
      id: 170,
      role: "user",
    },
    {
      content:
        "I just received my essay grade of 92% and I'm thrilled that my argumentation and evidence synthesis were praised, what can I do to further improve my skills for the next publication, especially since Robert and I are discussing next steps on July 20?",
      id: 212,
      role: "user",
    },
    {
      content:
        "Congratulations on receiving a 92% on your essay. To improve for the next publication, keep engaging with Robert's feedback, expand your reading, practice writing, attend workshops, participate in peer review, and refine argumentation.",
      id: 213,
      role: "assistant",
    },
    {
      content:
        "I'm feeling quite confident after getting such a high grade on July 10, but I want to make sure I'm on the right track for our Zoom meeting on July 20, can you help me review my progress and plan for the conference preparation?",
      id: 214,
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
      conversation_id: "robert-academic-mentor-summary",
      conversation_plan: "BATCH 7 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 12,
        subtopics: [
          "Academic essay writing",
          "Mentor feedback",
          "Conference preparation",
        ],
        theme:
          "From research planning to compelling argumentation in essays across disciplines",
        title: "Mastering the Art of Persuasive Academic Essay Writing",
      },
      narratives: "Robert academic mentorship and essay progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The Robert mentorship progressed from preparing for an initial mentor meeting, to using Robert's 1985 gender studies essay without copying, to prioritizing stronger warrants for gender-bias claims, to deciding how to balance journal submission with Greg's conference paper, and finally to reviewing progress for the July 20 Zoom meeting after a high essay grade.",
            question:
              "Can you give me a summary of how my work and interactions with Robert have developed over time, including the key steps and decisions I've made along the way?",
            question_id: "robert-academic-mentor-summary",
            question_type: "summarization",
            source_chat_ids: [14, 64, 124, 170, 214],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Darryl Wilson",
        user_relationships: "Robert, Greg, Carla",
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

function buildStephenRelationshipBeliefEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I think I'll start by setting some clear goals for the next few months and making conscious choices that align with what I truly value.",
      id: 8,
      role: "user",
    },
    {
      content:
        "I'm struggling with the idea of free will, especially since my mom Wendy believes in divine intervention shaping our choices.",
      id: 48,
      role: "user",
    },
    {
      content:
        "I had to decline a 3 PM meeting with Stephen on March 14 to focus on the startup offer, do you think I should've handled that differently?",
      id: 58,
      role: "user",
    },
    {
      content:
        "I'm worried that scheduling a work call on our anniversary, March 20, might hurt Stephen's feelings, what can I do to make it up to him?",
      id: 60,
      role: "user",
    },
    {
      content:
        "I started reading Elbow Room by Daniel Dennett on March 13, can you help me understand how compatibilism applies to job offers?",
      id: 62,
      role: "user",
    },
    {
      content:
        "I'm confused about how believing in free will can affect my motivation, like the 2022 University of Cambridge study said, especially since I just resolved my conflict with Stephen by celebrating our anniversary at The Coral Reef restaurant.",
      id: 74,
      role: "user",
    },
    {
      content:
        "I've committed to daily journaling to track my decisions and consequences, and I'm wondering if this self-accountability practice will help me make better choices.",
      id: 80,
      role: "user",
    },
    {
      content:
        "I agreed to limit my work trips to 3 per quarter starting June for Stephen, but I'm not sure how this will affect my career growth.",
      id: 110,
      role: "user",
    },
    {
      content:
        "I'll talk to Stephen about prioritizing the most important trips, using tech to stay connected, and doing quarterly reviews.",
      id: 112,
      role: "user",
    },
    {
      content:
        "I'm struggling to understand how Tanya's moral dilemmas about free will might influence my own beliefs.",
      id: 158,
      role: "user",
    },
    {
      content:
        "My romantic partner Stephen and I just celebrated 5 years together on May 20 with a dinner at The Sunset Grill on Bay Street, but I'm wondering how our relationship might change if I start questioning the concept of free will.",
      id: 164,
      role: "user",
    },
    {
      content:
        "I think talking about free will with Stephen can help us understand each other better, enhance our trust, and make us more supportive of each other.",
      id: 166,
      role: "user",
    },
    {
      content:
        "Let's talk about specific scenarios, like deciding whether to move to a new city for a job opportunity, so we can see how free will influences our decisions once a week.",
      id: 168,
      role: "user",
    },
    {
      content:
        "I feel bad about missing the meeting with Matthew, and now it's rescheduled for June 3 at 11 AM.",
      id: 200,
      role: "user",
    },
    {
      content:
        "I prefer resolving conflicts through calm dialogue, which is why I scheduled weekly check-ins with Stephen every Sunday at 6 PM.",
      id: 232,
      role: "user",
    },
    {
      content:
        "I'll set clear objectives, share the agenda with Stephen beforehand, start with positive feedback, use I statements, and keep a soft tone.",
      id: 234,
      role: "user",
    },
    {
      content:
        "I'll write down key points, share the agenda with Stephen ahead of time, start with positive feedback, use I statements, and stay calm.",
      id: 236,
      role: "user",
    },
    {
      content:
        "I'll journal about how my decisions align with Wendy's belief and seek guidance through prayer.",
      id: 248,
      role: "user",
    },
    {
      content:
        "I'm considering how my daily journaling starting April 1 will help me understand if I truly have free will, given the University of Cambridge study linking belief in free will to higher motivation and goal persistence.",
      id: 258,
      role: "user",
    },
    {
      content:
        "I'll keep up with my daily journaling and see how it helps me understand my beliefs about free will and how much they impact motivation and persistence.",
      id: 260,
      role: "user",
    },
    {
      content:
        "I'll stick to journaling every day and see how it helps me understand my beliefs about free will. I'll definitely pay attention to any patterns or insights that come up.",
      id: 262,
      role: "user",
    },
    {
      content:
        "I accepted the $95,000 streaming startup offer on April 2 and wonder whether free will or other factors shaped the decision.",
      id: 270,
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
      conversation_id: "stephen-relationship-belief-event-order",
      conversation_plan: "BATCH 12 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 17,
        subtopics: ["Free will", "Relationships", "Motivation"],
        theme:
          "Weighing personal relationships and beliefs while considering free will",
        title: "Free Will and Relationship Balance",
      },
      narratives: "Stephen relationship-belief event order",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: declining a Stephen meeting for the startup offer, worrying about a work call on the anniversary, resolving conflict through the Coral Reef anniversary celebration, limiting work trips for Stephen, reflecting on the five-year anniversary and free-will beliefs, scheduling Sunday weekly check-ins, and starting daily journaling about free will and motivation.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different aspects of balancing my personal relationship and beliefs throughout our conversations, in order? Mention ONLY and ONLY seven items.",
            question_id: "stephen-relationship-belief-event-order",
            question_type: "event_ordering",
            source_chat_ids: [
              58,
              60,
              74,
              110,
              112,
              164,
              166,
              168,
              232,
              234,
              236,
              258,
              260,
              262,
            ],
            total_mentions: 7,
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

function buildEstatePlanningProcessSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm Crystal, a TV/film producer in East Janethaven, Montserrat, and I was thinking about my estate plan as of March 15, 2024. Can you guide me through making sure my assets are distributed according to my wishes?",
      id: 4,
      role: "user",
    },
    {
      content:
        "Inventory your assets, identify beneficiaries, draft a will, consider trusts and powers of attorney, review with an attorney, and update the estate plan regularly.",
      id: 5,
      role: "assistant",
    },
    {
      content:
        "Including Douglas in your estate plan starts with listing assets, specifying provisions for Douglas, updating beneficiary designations, formalizing everything in your will, and reviewing the plan with an attorney.",
      id: 23,
      role: "assistant",
    },
    {
      content:
        "Choosing the right executor before the April 1 deadline means comparing Douglas and Kevin on responsibility, organizational skills, legal and financial knowledge, availability, emotional stability, trust, and willingness.",
      id: 33,
      role: "assistant",
    },
    {
      content:
        "I'm stressed about meeting my May 15 deadline to complete a legally valid will. Can you help me stay on track?",
      id: 40,
      role: "user",
    },
    {
      content:
        "Create a timeline, inventory assets, draft the will, consult an attorney in April, finalize the will in May, gather witnesses, and execute the document.",
      id: 41,
      role: "assistant",
    },
    {
      content:
        "Choosing an executor can be sensitive when it involves family dynamics. Given that Kimberly and Bradley attended the meeting where you discussed this, communicate clearly about why Douglas is the best fit, discuss the possibility of a co-executor like Kevin, seek professional advice from Stephanie, and document your decision clearly in your will.",
      id: 69,
      role: "assistant",
    },
    {
      content:
        "Here is my WillMaker Pro summary: Douglas is executor, Kevin is alternate executor, Stephanie is guardian, assets are listed, beneficiaries are recorded, and legal requirements are checked.",
      id: 82,
      role: "user",
    },
    {
      content:
        "Review the will summary by checking beneficiary addresses, executor roles, guardianship details, asset distribution, trust provisions, funeral instructions, and witness requirements.",
      id: 83,
      role: "assistant",
    },
    {
      content:
        "I'm worried about the probate process and how it was shortened to 5-7 months, especially because I have never used WillMaker Pro to draft my will.",
      id: 122,
      role: "user",
    },
    {
      content:
        "The probate process involves filing the will, court verification, appointment of the executor, inventory and appraisal, creditor notices, debt payment, and distribution of remaining assets.",
      id: 123,
      role: "assistant",
    },
    {
      content:
        "I'm worried about my estate plan being 90% complete, and I have a final review scheduled for September 15. How should I wrap everything up?",
      id: 160,
      role: "user",
    },
    {
      content:
        "To wrap up your estate plan, review and update documents, secure originals in the fireproof safe, provide copies, confirm beneficiary designations, and prepare questions for the final review.",
      id: 161,
      role: "assistant",
    },
    {
      content:
        "Discussing the $5,000 emergency fund for guardianship expenses with Douglas should include medical costs, educational needs, living expenses, the purpose of the emergency fund, and a productive conversation so you are on the same page with him as guardian supporter.",
      id: 179,
      role: "assistant",
    },
    {
      content:
        "Having Kevin, a paralegal, review your will draft means organizing documents, summarizing your wishes, and listing concerns about guardianship, asset distribution, and digital assets so his legal insights can be incorporated before attorney approval.",
      id: 189,
      role: "assistant",
    },
    {
      content:
        "I'm finalizing my will with Diana before Stephanie retires and I have a December 15 deadline after attending an Estate Tax Planning workshop.",
      id: 228,
      role: "user",
    },
    {
      content:
        "Prioritize workshop notes, update the will, secure digital assets, finalize beneficiary designations, prepare for Diana, and keep the December 15 deadline visible.",
      id: 229,
      role: "assistant",
    },
    {
      content:
        "I'm trying to finalize my estate plan by February 15 and have a completed binder with the home deed, insurance policies, and digital asset passwords.",
      id: 282,
      role: "user",
    },
    {
      content:
        "Use a comprehensive checklist for finalizing the estate plan: current will, witnesses, executor, digital assets, insurance, property records, taxes, and secure storage.",
      id: 283,
      role: "assistant",
    },
    {
      content:
        "I'm trying to finalize my will and had a disagreement with Douglas about charitable donations, but we agreed on 10% of my estate going to charity.",
      id: 298,
      role: "user",
    },
    {
      content:
        "Allocating 10% to charity can affect tax benefits, clarity, designated charities, alternative charities, beneficiary expectations, and the legal drafting of your estate plan.",
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
      conversation_id: "estate-planning-process-summary",
      conversation_plan: "BATCH 19 PLAN",
      conversation_seed: {
        category: "Estate planning",
        id: 19,
        subtopics: ["Executor", "Guardianship", "Asset management"],
        theme: "Estate planning",
        title: "Estate planning process",
      },
      narratives: "Estate planning process progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The estate planning process developed from including Douglas in the estate plan, to deciding between Douglas and Kevin as executor, to family discussion, guardianship emergency fund planning, and Kevin's paralegal review of the will draft.",
            question:
              "Can you give me a complete summary of how my estate planning process has developed, including the key decisions and discussions I've had about executors, guardianship, and asset management?",
            question_id: "estate-planning-process-summary",
            question_type: "summarization",
            source_chat_ids: [23, 33, 69, 179, 189],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal",
        user_relationships: "Douglas, Kevin, Kimberly, Bradley",
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

function buildPilotEpisodeTimelineSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm worried about meeting my deadline for the pilot episode by June 30, 2024, with a budget cap of $120,000.",
      id: 32,
      role: "user",
    },
    {
      content:
        "Managing a tight deadline and budget cap for a pilot episode requires a structured plan for the June 30, 2024 deadline and $120,000 budget, covering pre-production, production, post-production, milestones, and budget allocations.",
      id: 33,
      role: "assistant",
    },
    {
      content:
        "Focusing on script finalization is a smart move, especially given your tight deadline. Complete the script draft by the end of April, revise it, gather feedback, and postpone location scouting to early May so the pilot timeline stays realistic.",
      id: 39,
      role: "assistant",
    },
    {
      content:
        "Shifting your focus from scriptwriting to casting based on Heather's recommendation is strategic if early auditions help you lock in key talent.",
      id: 101,
      role: "assistant",
    },
    {
      content:
        "Declining the $15,000 documentary project can be the right call if it preserves the timeline integrity of your pilot episode.",
      id: 115,
      role: "assistant",
    },
    {
      content:
        "Pushing back the pilot delivery date to July 15 can be stressful, but with careful planning and effective time management, you can still meet the new deadline by reassessing the timeline, setting new milestones, compressing remaining work, and communicating changes.",
      id: 127,
      role: "assistant",
    },
    {
      content:
        "Given that your pilot episode is 75% complete by July 5, with 12 of 16 scenes filmed and 60% of post-production started, create a daily plan to film the remaining scenes and complete post-production by the July 15 deadline.",
      id: 157,
      role: "assistant",
    },
    {
      content:
        "Rejecting the $25,000 commercial shoot on August 30 is stressful, but it can protect the pilot schedule when multiple priorities and deadlines compete.",
      id: 201,
      role: "assistant",
    },
    {
      content:
        "Managing your time effectively to meet the September 1 deadline for your pilot editing and ensuring you have enough time for color grading is crucial. Prioritize editing tasks, reserve color grading time, and keep the post-production timeline visible.",
      id: 205,
      role: "assistant",
    },
    {
      content:
        "Setting realistic deadlines with built-in buffers is a good way to avoid last-minute rushes and reduce stress.",
      id: 223,
      role: "assistant",
    },
    {
      content:
        "Given that your post-production is 95% completed by November 15 and the final sound mix is scheduled for November 22, prioritize remaining tasks so all post-production elements, including sound mixing, are wrapped up on time.",
      id: 251,
      role: "assistant",
    },
    {
      content:
        "Balancing your work commitments with family time is crucial during a critical period like pilot launch week.",
      id: 255,
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
      conversation_id: "pilot-episode-timeline-summary",
      conversation_plan: "BATCH 17 PLAN",
      conversation_seed: {
        category: "Creative work",
        id: 17,
        subtopics: ["Pilot episode", "Timeline", "Post-production"],
        theme: "Managing a pilot episode production timeline",
        title: "Pilot Episode Timeline",
      },
      narratives: "Pilot episode timeline and task progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The pilot episode timeline began with a June 30, 2024 deadline and $120,000 budget, shifted to script finalization before location scouting, moved the delivery date to July 15 after casting delays, used a July 5 production and post-production status plan, then prioritized editing, color grading, and final sound mix deadlines.",
            question:
              "Can you give me a summary of how my pilot episode project timeline and tasks have developed and changed throughout our conversations?",
            question_id: "pilot-episode-timeline-summary",
            question_type: "summarization",
            source_chat_ids: [33, 39, 127, 157, 205, 251],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal",
        user_relationships: "Heather",
      },
      user_questions: [],
    },
  ];
}

function buildWritingSkillsConfidenceSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda nervous about improving my writing skills, I'm 45 and feel like I should be better at it by now, can you help me get started on this self-editing journey?",
      id: 0,
      role: "user",
    },
    {
      content:
        "Start your self-editing journey by reading widely, writing regularly, learning grammar basics, using self-editing techniques like reading aloud, seeking feedback, revising, and using tools such as Grammarly or Hemingway Editor.",
      id: 1,
      role: "assistant",
    },
    {
      content:
        "For grammar and sentence clarity, focus on subject-verb agreement, tense consistency, active voice, eliminating redundancies, varying sentence structure, using Grammarly, practicing regularly, and reading strong writing closely.",
      id: 3,
      role: "assistant",
    },
    {
      content:
        "Since you connected with Michael and share script editing tips weekly, make the sessions structured, set specific goals, exchange writing assignments, give detailed critiques, read and discuss published works, track progress, and set personal goals.",
      id: 7,
      role: "assistant",
    },
    {
      content:
        "To improve dialogue with Michael, use focused feedback sessions, study published scripts, run dialogue drills and writing exercises, transcribe real conversations, develop character voices, and discuss subtext and nuance.",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "Free tools like Grammarly, Hemingway Editor, Ginger, writing communities, daily writing practice, and peer review can still help you improve after rejecting the $300/month ProWritingAid subscription.",
      id: 45,
      role: "assistant",
    },
    {
      content:
        "Practicing the skills from the Advanced Editing Techniques webinar can help you apply them to your writing by reviewing the webinar, choosing a screenplay section, and applying specific techniques.",
      id: 121,
      role: "assistant",
    },
    {
      content:
        "It's normal to feel anxious about co-hosting your first writing workshop. Prepare thoroughly, build confidence, engage participants with icebreakers and activities, manage nerves, follow up for feedback, and lean on peers like Carla and Amy.",
      id: 183,
      role: "assistant",
    },
    {
      content:
        "Applying self-editing skills to screenplay writing means understanding screenplay structure, outlining scenes, completing a first draft, using writing tools, self-editing for clarity, and seeking beta-reader feedback.",
      id: 227,
      role: "assistant",
    },
    {
      content:
        "How can I build on the confidence boost from the workshop, which is now at 9/10, to improve my writing skills and make the most of the momentum from the positive feedback?",
      id: 240,
      role: "user",
    },
    {
      content:
        "Build on the workshop confidence boost by setting specific goals, continuing learning through courses and reading, practicing regularly, seeking constructive feedback, tracking progress, expanding your network, and maintaining a positive mindset.",
      id: 241,
      role: "assistant",
    },
    {
      content:
        "Prioritizing clarity over word count after cutting 1,200 words can improve readability, but balance clarity, depth, audience expectations, feedback, and your writing style.",
      id: 265,
      role: "assistant",
    },
    {
      content:
        "I had a balanced production shoot on October 3, lost 6 hours, and gained 8 hours over the weekend for writing. How can I optimize this schedule?",
      id: 318,
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
      conversation_id: "writing-skills-confidence-summary",
      conversation_plan: "BATCH 10 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 10,
        subtopics: ["Self-editing", "Feedback", "Confidence"],
        theme: "Developing writing skills and confidence over time",
        title: "Writing Skills Confidence Journey",
      },
      narratives: "Writing skills and confidence learning journey",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The writing journey began with foundational self-editing habits, moved into grammar and sentence clarity with tools, expanded through Michael's weekly script editing sessions and dialogue exercises, then grew through workshop preparation and a later confidence boost supported by goals, learning, feedback, tracking, networking, and a positive mindset.",
            question:
              "Can you summarize how my writing skills and confidence have developed through my learning and interactions over time?",
            question_id: "writing-skills-confidence-summary",
            question_type: "summarization",
            source_chat_ids: [1, 3, 7, 9, 183, 241],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal",
        user_relationships: "Michael, Carla, Amy",
      },
      user_questions: [],
    },
  ];
}

function buildFamilyMovieBasicProjectSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm Crystal, a TV/film producer from East Janethaven, Montserrat, and I'm gonna be free at 9:00 AM, so can you recommend some streaming movies that I can watch with my family, given my background in the film industry, to make the most of our time together?",
      id: 4,
      role: "user",
    },
    {
      content:
        "Absolutely, mixing musicals and family-friendly content is a fantastic idea for bringing joy and sparking conversations. I recommended classic and hidden gem movies including Singin' in the Rain, The Wizard of Oz, Mary Poppins, Mamma Mia!, The Princess Bride, Paddington, and The Parent Trap.",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "Given your shared love for classic films, I recommended timeless movies such as Casablanca, Gone with the Wind, It's a Wonderful Life, The Maltese Falcon, Singin' in the Rain, and Vertigo for a nostalgic movie night.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "Always confirm time zones when I ask about meeting or interview times.",
      id: 266,
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
      conversation_id: "family-movie-basic-project-summary",
      conversation_plan: "BATCH 14 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 19,
        subtopics: ["Family movies", "Streaming recommendations"],
        theme:
          "Balancing entertainment value, age appropriateness, and availability across platforms",
        title: "Finding the Best Streaming Movies for a Family Weekend",
      },
      narratives: "Family movie recommendation project",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The project started with initial family streaming-movie planning, then moved into family-friendly classics and hidden gems, and continued with classic-film recommendations for a nostalgic movie night.",
            question: "Can you give me a summary of what happened with the project?",
            question_id: "family-movie-basic-project-summary",
            question_type: "summarization",
            source_chat_ids: [4, 9, 13],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Crystal",
        user_relationships: "Thomas, Amy, Kyle",
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

function buildWeatherAutocompleteEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm building a weather app using JavaScript and OpenWeather API v2.5, and I need help structuring the code before adding more advanced features.",
      id: 6,
      role: "user",
    },
    {
      content:
        "I'm trying to implement city autocomplete using OpenWeather's Geocoding API v1, and I want to add a debounce delay of 300ms to reduce API calls.",
      id: 20,
      role: "user",
    },
    {
      content:
        "Handling cases where the API response time exceeds the debounce delay of 300ms is important. Cancel previous autocomplete requests when a new one is initiated and ignore stale autocomplete responses.",
      id: 22,
      role: "assistant",
    },
    {
      content:
        "If the user types quickly and the debounce delay isn't sufficient, dynamically adjust the debounce delay based on typing speed and ensure only the most recent autocomplete request is processed.",
      id: 24,
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
        "I obtained an OpenWeather API key and completed the UI wireframe for the weather app.",
      id: 42,
      role: "user",
    },
    {
      content:
        "I'm trying to decide between using pure JavaScript or React for my frontend, but I chose vanilla JavaScript for simplicity and faster deployment.",
      id: 44,
      role: "user",
    },
    {
      content:
        "I've never actually obtained an API key for this project, so I'm not sure how to proceed with implementing the weather app.",
      id: 70,
      role: "user",
    },
    {
      content:
        "I'm trying to integrate city autocomplete into my weather app and want to make sure I'm handling API errors more robustly with a try-catch block around the OpenWeather API call.",
      id: 74,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the autocomplete feature in my weather app to reduce API calls while still providing a good user experience, so I limited the results to 5 items.",
      id: 94,
      role: "user",
    },
    {
      content:
        "I fixed a bug where autocomplete suggestions disappeared too early after clicking a result, and I updated autocomplete.js to keep the selected city stable.",
      id: 132,
      role: "user",
    },
    {
      content:
        "I'm trying to implement an error boundary component in vanilla JavaScript to catch runtime errors and show a fallback UI.",
      id: 136,
      role: "user",
    },
    {
      content:
        "I'm working on the final autocomplete implementation pass: cache the last three searched cities, preserve selected city state, and keep the suggestions list consistent after async updates.",
      id: 160,
      role: "user",
    },
    {
      content:
        "I'm adding Cypress end-to-end tests for search, autocomplete, error display, and the retry mechanism.",
      id: 172,
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
      conversation_id: "weather-autocomplete-event-order",
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
      narratives: "Weather app city autocomplete implementation ordering",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The city autocomplete implementation came up in this order: initial OpenWeather Geocoding API v1 with 300ms debounce, stale request cancellation, dynamic debounce adjustment, robust try-catch API error handling, and the final autocomplete implementation pass with cache and selected-city state.",
            question:
              "Can you list the order in which I brought up different aspects of implementing the city autocomplete feature across our conversations, in order? Mention ONLY and ONLY five items.",
            question_id: "weather-autocomplete-event-order",
            question_type: "event_ordering",
            source_chat_ids: [20, 22, 24, 74, 160],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Weather app developer",
        user_relationships: "OpenWeather",
      },
      user_questions: [],
    },
  ];
}

function buildResearchWritingProjectsEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm gonna be working on a project on March 3, 2024, and I'm based in East Janethaven, Montserrat, so can you help me understand how my location and the time anchor might influence my approach to mastering the art of persuasive academic essay writing?",
      id: 4,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that my commanding presence might come off as too aggressive in my academic essays, how can I balance being sharp and efficient with being persuasive?",
      id: 6,
      role: "user",
    },
    {
      content:
        "I've recently met Greg, 23, at the University of Montserrat seminar on Feb 20, 2024, and we're planning to do some joint research on media influence - what are some tips for a successful collaboration with someone that much younger than me?",
      id: 16,
      role: "user",
    },
    {
      content:
        "Always format dates as Month Day, Year when I ask about timeline details.",
      id: 50,
      role: "user",
    },
    {
      content:
        "I've never used any citation management software, like Zotero, so how do I get started with managing my citations for these articles",
      id: 52,
      role: "user",
    },
    {
      content:
        "I'm kinda stuck on how to effectively use NVivo for my qualitative data analysis, especially since Greg suggested it and I just installed it on April 3, which has already improved my coding speed by 30%",
      id: 54,
      role: "user",
    },
    {
      content:
        "Thanks for the tips! I've been organizing my film scripts into nodes based on themes like gender roles and power dynamics. Coding is going pretty smoothly, but I'm still figuring out how to best use queries and visualizations.",
      id: 56,
      role: "user",
    },
    {
      content:
        "I'm kinda frustrated with synthesizing conflicting data from those 3 articles on April 3, and I took a 2-hour break to reset, so can you help me figure out how to better manage my time when dealing with tough research like that",
      id: 70,
      role: "user",
    },
    {
      content:
        "I'm kinda struggling to understand how to apply rhetorical devices and bias from those 5 key articles I finished noting by April 4, can you help me break it down further?",
      id: 86,
      role: "user",
    },
    {
      content:
        "I've been studying the Toulmin model since April 2, and I applied claim, data, warrant, backing, and rebuttal in my outline, but I'm wondering if I should review it again to make sure I'm using it correctly",
      id: 96,
      role: "user",
    },
    {
      content:
        "I'm finalizing my first draft of the essay by May 15, 2024, and I have 4,500 words to submit, can you help me manage my time effectively to meet this deadline?",
      id: 116,
      role: "user",
    },
    {
      content:
        "I'm kinda stuck on how to incorporate Heather's suggestion to add more statistical evidence into my essay, especially since she gave me this feedback after we exchanged drafts on May 7 via Google Docs",
      id: 122,
      role: "user",
    },
    {
      content:
        "I'm trying to understand how I can improve my essay writing, especially since my final draft reached 4,700 words by May 13, which is more than I initially targeted, and I've never missed any scheduled writing sessions or production meetings",
      id: 158,
      role: "user",
    },
    {
      content:
        "Always use Scrivener's split-screen mode for editing when I ask about draft revisions.",
      id: 160,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about meeting the June 5 deadline for submitting my essay to Montserrat Journal of Media Studies, as Robert recommended, and I also have to work on the conference paper with Greg by June 3, so can you help me prioritize these tasks and create a schedule",
      id: 168,
      role: "user",
    },
    {
      content:
        "Declining the freelance project was the right call so you could focus on the journal submission and stay motivated.",
      id: 181,
      role: "assistant",
    },
    {
      content:
        "What's the best way to ensure Greg and I can effectively collaborate on our conference paper draft, considering we've already submitted it to the Montserrat Media Symposium on July 12?",
      id: 216,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "research-writing-projects-event-order",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 12,
        subtopics: [
          "Thesis formulation",
          "Evidence synthesis",
          "Citation management tools",
          "Editing for clarity and precision",
        ],
        theme:
          "From research planning to compelling argumentation in essays across disciplines",
        title: "Mastering the Art of Persuasive Academic Essay Writing",
      },
      narratives: "Research and writing projects event order",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You mentioned these aspects in this order: planning a collaboration with Greg after a seminar, using NVivo for qualitative data analysis after Greg suggested it, incorporating Heather's feedback about statistical evidence, prioritizing essay and conference-paper deadlines, and ensuring effective collaboration with Greg after submitting the conference paper.",
            question:
              "Can you list in order how I brought up different aspects of my research and writing projects throughout our conversations? Mention ONLY and ONLY five items.",
            question_id: "research-writing-projects-event-order",
            question_type: "event_ordering",
            source_chat_ids: [16, 54, 122, 168, 216],
          },
        ],
        knowledge_update: [
          {
            answer: "4,700 words",
            question: "How many words does my final essay draft contain?",
            question_id: "research-writing-projects-final-draft-word-count",
            question_type: "knowledge_update",
            source_chat_ids: [116, 158],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Television/film producer learning academic writing",
        user_relationships: "Greg, Heather, Robert",
      },
      user_questions: [],
    },
  ];
}

function buildProbabilityConceptsEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to understand probability as a ratio, and I want to start with simple events like coin tosses and dice rolls, so can you help me figure out the probability of getting heads when I flip a coin, like what's the ratio of heads to total outcomes, I'm thinking it's 1:2, but I'm not sure, and how does this relate to the concept of probability as a ratio, can you explain it to me in a way that makes sense for a beginner like me, I'm 44 and just starting to learn this stuff, so go easy on me ->-> 1,3",
      id: 6,
      role: "user",
    },
    {
      content:
        "I'm trying to understand probability as a ratio of favorable outcomes to total outcomes, but I'm having trouble wrapping my head around it - can you help me with a simple example, like a coin toss, where the probability of getting heads is the number of favorable outcomes, which is 1, divided by the total number of outcomes, which is 2, so the probability is 1/2 or 0.5, and I want to make sure I understand this concept correctly because I'm 44 years old and I feel like I should know this already, and I'm a colour technologist from Port Michael, but I've never really studied probability before, so I'm starting from scratch ->-> 1,4",
      id: 10,
      role: "user",
    },
    {
      content:
        "I'm trying to understand the difference between independent and mutually exclusive events, can you help me with that, like what's an example of each, maybe something with coin tosses or dice rolls, I want to see the probability calculations for both cases, so I can clarify the concepts in my head ->-> 1,5",
      id: 14,
      role: "user",
    },
    {
      content:
        "I'm trying to decide where to start with probability, and I've got two options - coin toss problems where the probability of getting heads is 1/2, or dice roll problems where the probability of rolling a 4 is 1/6, so should I start with coin toss problems or dice roll problems to get a better understanding of probability basics, like how to calculate the probability of an event as a ratio of favorable outcomes to total outcomes, and how to differentiate between independent and mutually exclusive events, which seems crucial for my practical and intellectual growth as a 44-year-old colour technologist from Port Michael ->-> 1,6",
      id: 16,
      role: "user",
    },
    {
      content:
        "I think I'll start with coin toss problems. They seem simpler and will help me get a good grasp of the basics. Can you give me a couple of coin toss exercises to start with?",
      id: 18,
      role: "user",
    },
    {
      content:
        "These exercises are really helpful! I think I understand the basics now. The probability of getting heads in a single coin toss is 1/2, and for two coin tosses, the probability of getting heads twice is 1/4. It makes sense that the probability of getting at least one heads in two tosses is 3/4. Thanks for walking me through these examples! Do you have any more exercises like these to practice with?",
      id: 20,
      role: "user",
    },
    {
      content:
        "I'm trying to understand why P(A or B) = P(A) + P(B) only holds for mutually exclusive events, can you explain it to me with an example, like if I have two events A and B, and they are mutually exclusive, then the probability of A or B happening is just the sum of their individual probabilities, but if they are not mutually exclusive, then we need to subtract the probability of both A and B happening, so P(A or B) = P(A) + P(B) - P(A and B), I want to make sure I get this concept right, so I can apply it to my probability problems ->-> 1,8",
      id: 24,
      role: "user",
    },
    {
      content:
        "I'm trying to understand the concept of permutations and combinations, specifically with 3 objects, and I see that 3! equals 6, which represents the number of ways to arrange these objects, and 3C2 equals 3, which is the number of ways to choose 2 objects out of 3 without considering the order, so can you help me solve a problem where I have 3 different colored balls, and I want to find the number of ways to arrange them in a row, and also the number of ways to choose 2 balls out of the 3, considering that the order doesn't matter in the second case? ->-> 1,10",
      id: 28,
      role: "user",
    },
    {
      content:
        "I'm trying to understand why tossing two coins is considered independent events, can you help me calculate P(both heads) using the formula 1/2 × 1/2 = 1/4, I want to make sure I get it right ->-> 1,11",
      id: 30,
      role: "user",
    },
    {
      content:
        "Certainly, Craig! Let's break down why tossing two coins is considered independent events and how to calculate the probability of getting heads on both coins.\n\n### Independent Events\n\nTwo events are independent if the occurrence of one event does not affect the probability of the other event occurring. In the case of tossing two coins, the outcome of the first coin toss does not influence the outcome of the second coin toss.\n\n### Calculating P(Both Heads)\n\nTo calculate the probability of getting heads on both coin tosses, we use the fact that the events are independent. The probability of both independent events occurring is the product of their individual probabilities.\n\n#### Step-by-Step Calculation\n\n1. **Probability of getting heads on the first coin toss (Event A)**:\n   \\[\n   P(A) = \\frac{1}{2}\n   \\]\n\n2. **Probability of getting heads on the second coin toss (Event B)**:\n   \\[\n   P(B) = \\frac{1}{2}\n   \\]\n\n3. **Probability of both events occurring (both heads)**:\n   \\[\n   P(A \\text{ and } B) = P(A) \\times P(B) = \\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{4}\n   \\]\n\n### Summary\n\n- **Probability of getting heads on the first coin toss**: \\(\\frac{1}{2}\\)\n- **Probability of getting heads on the second coin toss**: \\(\\frac{1}{2}\\)\n- **Probability of getting heads on both coin tosses**: \\(\\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{4}\\)\n\nSo, the probability of getting heads on both coin tosses is \\(\\frac{1}{4}\\) or 0.25.\n\n### Verification\n\nTo further verify, let's list all possible outcomes when tossing two coins:\n- HH (Heads, Heads)\n- HT (Heads, Tails)\n- TH (Tails, Heads)\n- TT (Tails, Tails)\n\nThere are 4 possible outcomes, and only one of them is HH. Thus, the probability of getting both heads is:\n\\[\n\\frac{\\text{Number of favorable outcomes}}{\\text{Total number of outcomes}} = \\frac{1}{4}\n\\]\n\nThis confirms our earlier calculation.\n\nDo you have any more questions or need further clarification on this concept?",
      id: 31,
      role: "assistant",
    },
    {
      content:
        "I'm having trouble understanding the difference between mutually exclusive and independent events, especially in the context of rolling dice - can you help me identify where I went wrong when I confused these two concepts in a problem about rolling dice, maybe provide an example of each to clarify the difference, like what's the probability of rolling an even number on a 6-sided die and how does that relate to mutually exclusive events ->-> 1,13",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm really enjoying these lively discussions about probability, and I have to say, challenging conventional wisdom is so much fun, it helps me question probability misconceptions like gambler’s fallacy, so can you help me understand how to calculate the probability of independent events, like tossing two coins, where P(both heads) = 1/2 × 1/2 = 1/4, and how does this relate to my goal of solving 10 probability problems involving single events with at least 80% accuracy by February 1, which is just a few weeks away from January 10, 2024, and I've already spent 3 hours studying probability basics, including 2 hours on coin toss and dice roll problems, so I'm hoping to use this knowledge to improve my understanding of probability as a ratio, starting with simple events like coin tosses and dice rolls, and maybe even apply it to more complex problems like drawing an ace from a standard 52-card deck, where P = 4/52 = 1/13, and I'm also interested in learning about permutations and combinations, like permutations of 3 objects, where 3! = 6, and combinations of 3 choose 2, where 3C2 = 3, and how these concepts can help me analyze problems, like the probability of rolling an even number on a 6-sided die, or the probability of rolling a number greater than 4, where P(rolling a number greater than 4) = 2/6 = 1/3, so I'd love to get your help on this, thanks ->-> 1,20",
      id: 48,
      role: "user",
    },
    {
      content:
        "I'm trying to calculate the probability of rolling a 3 or 4 on a fair six-sided die, and I think it should be 1/6 + 1/6 = 1/3, but I want to make sure I'm doing it right for mutually exclusive events, so can you check if my calculation P(rolling a 3 or 4) = 1/6 + 1/6 = 1/3 is correct? ->-> 1,21",
      id: 50,
      role: "user",
    },
    {
      content:
        "Certainly, Craig! Let's verify your calculation for the probability of rolling a 3 or 4 on a fair six-sided die.\n\n### Problem: Probability of Rolling a 3 or 4\n\n1. **Identify the Total Number of Possible Outcomes**:\n   - A fair six-sided die has the numbers 1, 2, 3, 4, 5, and 6.\n   - Therefore, the total number of possible outcomes is 6.\n\n2. **Identify the Favorable Outcomes**:\n   - The favorable outcomes are rolling a 3 or rolling a 4.\n   - There are 2 favorable outcomes.\n\n3. **Check if the Events are Mutually Exclusive**:\n   - Rolling a 3 and rolling a 4 are mutually exclusive events because they cannot occur simultaneously.\n\n4. **Calculate the Probability**:\n   - The probability of rolling a 3 is \\( P(\\text{rolling a 3}) = \\frac{1}{6} \\).\n   - The probability of rolling a 4 is \\( P(\\text{rolling a 4}) = \\frac{1}{6} \\).\n\nSince the events are mutually exclusive, the probability of either event occurring is the sum of their individual probabilities:\n\n\\[\nP(\\text{rolling a 3 or 4}) = P(\\text{rolling a 3}) + P(\\text{rolling a 4}) = \\frac{1}{6} + \\frac{1}{6} = \\frac{2}{6} = \\frac{1}{3}\n\\]\n\n### Conclusion\n\nYour calculation is correct. The probability of rolling a 3 or 4 on a fair six-sided die is indeed:\n\n\\[\nP(\\text{rolling a 3 or 4}) = \\frac{1}{6} + \\frac{1}{6} = \\frac{1}{3}\n\\]\n\n### Summary\n\n- **Total number of possible outcomes**: 6\n- **Number of favorable outcomes**: 2 (rolling a 3 or 4)\n- **Probability**: \\( \\frac{1}{6} + \\frac{1}{6} = \\frac{2}{6} = \\frac{1}{3} \\)\n\nYou have correctly calculated the probability for mutually exclusive events. If you have any more questions or need further clarification, feel free to ask!",
      id: 51,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand this conditional probability concept, specifically P(A|B), but I need some help with it, I've been introduced to it briefly and I want to dive deeper into how it works and what it means, can you explain it to me in a way that I can apply to problems like the ones I've been practicing with coin tosses and dice rolls? ->-> 1,24",
      id: 56,
      role: "user",
    },
    {
      content:
        "Got it, but what about calculating \\( P(A|B) \\) for drawing a face card or a spade from a deck? ->-> 1,25",
      id: 58,
      role: "user",
    },
    {
      content:
        "Great question, Craig! Let's calculate the conditional probability \\( P(A|B) \\) for drawing a face card or a spade from a standard 52-card deck. We'll define the events and then apply the formula for conditional probability.\n\n### Define the Events\n\n- **Event \\( A \\)**: Drawing a face card (Jack, Queen, King).\n- **Event \\( B \\)**: Drawing a spade.\n\n### Calculate \\( P(A|B) \\)\n\nThe formula for conditional probability is:\n\n\\[\nP(A|B) = \\frac{P(A \\cap B)}{P(B)}\n\\]\n\nWhere:\n- \\( P(A \\cap B) \\) is the probability of drawing a card that is both a face card and a spade.\n- \\( P(B) \\) is the probability of drawing a spade.\n\n### Step-by-Step Calculation\n\n1. **Determine \\( P(B) \\)**:\n   - There are 13 spades in a standard 52-card deck.\n   - So, \\( P(B) = \\frac{13}{52} = \\frac{1}{4} \\).\n\n2. **Determine \\( P(A \\cap B) \\)**:\n   - The face cards in spades are the Jack, Queen, and King of spades.\n   - So, there are 3 face cards that are also spades.\n   - Therefore, \\( P(A \\cap B) = \\frac{3}{52} \\).\n\n3. **Calculate \\( P(A|B) \\)**:\n   \\[\n   P(A|B) = \\frac{P(A \\cap B)}{P(B)} = \\frac{\\frac{3}{52}}{\\frac{1}{4}} = \\frac{3}{52} \\times \\frac{4}{1} = \\frac{3 \\times 4}{52} = \\frac{12}{52} = \\frac{3}{13}\n   \\]\n\n### Final Answer\n\nThe probability of drawing a face card given that the card drawn is a spade is:\n\n\\[\nP(A|B) = \\frac{3}{13}\n\\]\n\n### Summary\n\n- **Event \\( A \\)**: Drawing a face card.\n- **Event \\( B \\)**: Drawing a spade.\n- **\\( P(B) \\)**: Probability of drawing a spade is \\( \\frac{1}{4} \\).\n- **\\( P(A \\cap B) \\)**: Probability of drawing a face card that is also a spade is \\( \\frac{3}{52} \\).\n- **\\( P(A|B) \\)**: Probability of drawing a face card given that the card is a spade is \\( \\frac{3}{13} \\).\n\nThis calculation shows how to apply the concept of conditional probability to a specific scenario involving a deck of cards.\n\nIf you have any more questions or need further examples, feel free to ask!",
      id: 59,
      role: "assistant",
    },
    {
      content:
        "Always provide step-by-step explanations with concrete examples when I ask about probability concepts. ->-> 1,27",
      id: 64,
      role: "user",
    },
    {
      content:
        "I'm trying to calculate the probability of drawing 2 aces together from a deck of 52 cards, and I came across this formula: 4C2 / 52C2 = 6/1326 ≈ 0.00452, can you help me understand how this works and what it means for my chances of getting two aces in a row? ->-> 2,6",
      id: 76,
      role: "user",
    },
    {
      content:
        "I'm trying to visualize dependent event probabilities using tree diagrams for clarity, but I'm having trouble understanding how to apply this to a problem like drawing two aces in a row from a 52-card deck without replacement, can you help me set up the tree diagram and calculate the probabilities at each step? ->-> 2,15",
      id: 102,
      role: "user",
    },
    {
      content:
        "I'm trying to understand how to calculate the probability of dependent events, and I came across the concept of conditional probability, which is given by P(A|B) = P(A ∩ B) / P(B), and I want to apply this to a problem where I draw two cards from a 52-card deck without replacement, and I want to find the probability that the second card is an ace given that the first card was an ace, so can you help me solve this using the formula P(A|B) = P(A ∩ B) / P(B), where A is the event that the second card is an ace and B is the event that the first card is an ace, and the probability of drawing an ace from a 52-card deck is 4/52, and after drawing the first ace, there are 51 cards left and 3 aces left, so the probability of drawing a second ace is 3/51, and I'm not sure how to apply the conditional probability formula to this problem, and I also want to know how to calculate the probability of drawing 2 aces in a row from a 52-card deck without replacement, which is given by the formula P(A ∩ B) = P(A) × P(B|A), where P(A) is the probability of drawing the first ace, which is 4/52, and P(B|A) is the probability of drawing the second ace given that the first ace was drawn, which is 3/51, so can you help me with this, and also explain why the formula P(A and B) = P(A) × P(B) only works for independent events, and how to use combinations to calculate probabilities, like 4C2 / 52C2, and how to compare direct counting and conditional probability approaches for dependent events problems, and I've been practicing dependent event problems for 4 hours, including 3 card draw and 5 dice roll scenarios, and I've completed 8 conditional probability problems and improved my accuracy from 60% to 85% over 2 weeks, and I've spent a total of 4 hours studying probability basics, and I've retained 88% accuracy on a quiz with 12 problems on dependent events and conditional probability, so can you help me with these problems and concepts, and also explain how to use tree diagrams to visualize dependent event probabilities, and how to verify if my calculation for P(drawing a heart or a queen) is correct, and I'm also confused about how to calculate the probability of rolling a 6 on the first die and an even number on the second die, and I want to know how to analyze problems like the probability of drawing an ace from a standard 52-card deck, and I need help with understanding why P(A ∩ B) = 0 for mutually exclusive events, and I want to learn how to explain probability concepts, like why P(A or B) = P(A) + P(B) only holds for mutually exclusive events, and I've been tracking my progress and I've been studying for 4 hours, and I've been using step-by-step explanations with concrete examples to understand probability fundamentals, and I prefer to start with coin toss problems, and I want to solve 10 probability problems involving single events with at least 80% accuracy, and I've been extending my study sessions to 4 hours, and I've been dedicating an extra hour to practicing dice roll problems, so can you help me with all these questions and concepts, and also provide step-by-step explanations with concrete examples, and verify my solutions, and explain the concepts in a way that I can understand, and provide alternative methods for solving problems, and help me with my progress tracking, and provide feedback on my study plan, and help me with my goal of understanding probability basics, and I'm 44 years old, and I'm a color technologist, and I'm from Port Michael, and I'm eager to learn probability basics for practical and intellectual growth, and I've never completed any coin toss problems before, and I've been introduced to P(A|B) but I need to understand it better, and I've been using combinations to calculate probabilities, and I've been analyzing problems like the probability of rolling an even number on a 6-sided die, and I've been verifying my solutions, and I've been tracking my time spent studying, and I've been using tree diagrams to visualize dependent event probabilities, and I've been comparing direct counting and conditional probability approaches, and I've been practicing dependent event problems, and I've been retaining my knowledge, and I've been improving my accuracy, and I've been extending my study sessions, and I've been dedicating extra time to practicing, so can you help me with all these questions and concepts ->-> 2,17",
      id: 108,
      role: "user",
    },
    {
      content:
        "Always include visual aids like tree diagrams when I ask about dependent event probability problems. ->-> 2,28",
      id: 132,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "probability-concepts-event-order",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Math",
        id: 8,
        subtopics: [
          "Probability as a ratio",
          "Independent and dependent events",
          "Mutually exclusive events",
          "Basic counting principles",
        ],
        theme:
          "Calculating simple probabilities and exploring common probability puzzles",
        title: "Understanding the Basics of Probability",
      },
      narratives: "Probability foundational concepts event order",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You mentioned foundational probability concepts in this order: 1) Understanding probability as a ratio using simple examples like coin tosses and dice rolls, 2) Clarifying the difference between independent and mutually exclusive events with examples, 3) Deciding whether to start learning with coin toss or dice roll problems, 4) Exploring probability calculations for combined events such as tossing two coins, 5) Delving into the addition rule for mutually exclusive events and its exceptions, 6) Discussing conditional probability and how to apply it to practical problems.",
            question:
              "Can you list the order in which I brought up different foundational concepts related to probability throughout our conversations, in order? Mention ONLY and ONLY six items.",
            question_id: "probability-concepts-event-order",
            question_type: "event_ordering",
            source_chat_ids: [6, 10, 14, 34, 16, 18, 30, 20, 24, 50, 56, 58],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Colour technologist learning probability basics",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildResumeImprovementAreasBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm thinking of asking for a $10,000 salary increase based on my new resume and portfolio, but I'm not sure if that's too much, can you give me some advice on how to negotiate that? ->-> 1,14",
      id: 28,
      role: "user",
    },
    {
      content:
        "Always use structured bullet points with quantified achievements when I ask about resume formatting preferences. ->-> 1,22",
      id: 46,
      role: "user",
    },
    {
      content:
        "I chose to highlight 5 award-winning projects in my portfolio after Alexis advised focusing on storytelling impact, but I'm wondering if that was the right decision, can you offer some guidance? ->-> 2,12",
      id: 72,
      role: "user",
    },
    {
      content:
        "Focusing on 5 award-winning projects in your portfolio is a strong decision, especially given Alexis's advice to emphasize storytelling impact. Highlighting your most impactful and recognized work can significantly enhance your portfolio's effectiveness. Here are some guidelines to ensure you are making the most of this approach:\n\n### 1. Select Projects with Maximum Impact\nChoose projects that not only won awards but also had a significant impact in terms of audience engagement, critical acclaim, or innovative storytelling techniques. This will help demonstrate your ability to create meaningful and memorable content.\n\n### 2. Provide Context and Details\nFor each project, provide detailed context and information that showcases your role and contributions. This includes:\n\n- **Project Overview**: Briefly describe the project, its purpose, and the target audience.\n- **Your Role**: Clearly state your specific responsibilities and how you contributed to the project's success.\n- **Outcomes**: Highlight the outcomes, such as audience engagement metrics, critical reviews, or any other notable achievements.\n\n### 3. Use Visuals Effectively\nIncorporate high-quality visuals, such as screenshots, video clips, and behind-the-scenes footage, to illustrate your projects. Visuals can help tell the story of your work more vividly and engagingly.\n\n### 4. Include Testimonials and Awards\nIf available, include testimonials from clients, collaborators, or industry experts. Additionally, list any awards or recognitions the projects received, as this adds credibility and highlights your achievements.\n\n### 5. Tell a Story\nAs Alexis advised, focus on the storytelling impact. Explain how each project told a compelling story and resonated with the audience. Use narratives to connect the dots between your creative vision, execution, and the final result.\n\n### 6. Tailor to the Audience\nConsider the perspective of the person viewing your portfolio. Tailor the presentation to align with the interests and needs of the target audience, whether it's a potential employer or a client.\n\n### Example Portfolio Entry\n\n#### Project: \"The Journey\"\n- **Overview**: A documentary series that explores the lives of individuals navigating significant life changes.\n- **Role**: Producer and Editor\n- **Responsibilities**: Conceptualized the series, managed the production team, and edited the final episodes.\n- **Outcomes**: Won the Best Documentary Series Award at the International Film Festival. Achieved a 95% viewer retention rate and received critical acclaim for its emotional depth and storytelling.\n- **Testimonial**: \"Crystal's ability to capture raw emotion and weave it into a compelling narrative is unparalleled. 'The Journey' is a testament to her talent and vision.\" - John Doe, Director of Content, XYZ Media.\n- **Visuals**: Include a trailer, behind-the-scenes photos, and screenshots of key scenes.\n\n### 7. Review and Refine\nOnce you have selected and presented your projects, review them critically. Ask yourself:\n- Does each project clearly demonstrate my skills and contributions?\n- Are the visual elements and narratives engaging and impactful?\n- Does the overall presentation align with my career goals and the needs of my target audience?\n\n### 8. Seek Feedback\nBefore finalizing your portfolio, seek feedback from trusted colleagues, mentors, or industry professionals. Their insights can help you refine your presentation and ensure it effectively communicates your strengths and achievements.\n\n### Conclusion\nHighlighting 5 award-winning projects in your portfolio is a solid strategy, especially when you focus on storytelling impact. By providing detailed context, using compelling visuals, and emphasizing the outcomes and testimonials, you can create a portfolio that truly stands out. Keep refining and seeking feedback to ensure your portfolio is as effective as possible. Good luck!",
      id: 73,
      role: "assistant",
    },
    {
      content:
        "Always highlight quantified achievements when I ask about resume content improvements. ->-> 2,22",
      id: 94,
      role: "user",
    },
    {
      content:
        "I've got my first performance review scheduled for October 15, 2024, and I'm aiming for a 10% salary increase, do you have any tips on how to negotiate that? ->-> 3,6",
      id: 112,
      role: "user",
    },
    {
      content:
        "I'm kinda confused about how to make my resume pass any applicant tracking system, so can you help me understand why Karen recommended focusing on international resume standards, like for the UK and US markets? ->-> 3,11",
      id: 122,
      role: "user",
    },
    {
      content:
        "Certainly! Focusing on international resume standards, particularly for markets like the UK and US, is a strategic approach to ensure your resume is versatile and can pass through various applicant tracking systems (ATS). Here are some key reasons why Karen recommended this approach:\n\n### 1. **Versatility and Adaptability**\n- **Global Appeal:** By adhering to international resume standards, your resume becomes more adaptable to different job markets and industries.\n- **Broader Opportunities:** This approach opens up more job opportunities globally, as you can apply to roles in multiple countries without needing to rewrite your resume extensively.\n\n### 2. **ATS Compatibility**\n- **Standardized Format:** International resume standards often follow a standardized format that is more likely to be recognized by ATS.\n- **Common Keywords:** These standards typically include commonly used keywords and phrases that are recognized across different regions, increasing the likelihood of your resume passing through ATS.\n\n### 3. **Cultural Competence**\n- **Understanding Differences:** Different countries have different expectations for resumes. For example, the UK prefers a CV (Curriculum Vitae) that is more detailed and comprehensive, while the US typically uses a shorter resume.\n- **Tailored Content:** Understanding these differences allows you to tailor your resume appropriately for each market, which can be crucial for standing out to hiring managers.\n\n### 4. **Professional Development**\n- **Enhanced Skills:** Learning about international resume standards can enhance your understanding of global business practices and professional norms.\n- **Competitive Edge:** Demonstrating your ability to adapt to different standards can be seen as a valuable skill by potential employers, especially in multinational companies.\n\n### 5. **Consistency and Clarity**\n- **Clear Structure:** Following international standards ensures a clear and consistent structure, which is easier for ATS to parse.\n- **Readable Format:** A well-structured resume is more likely to be readable by both humans and machines, increasing your chances of advancing in the hiring process.\n\n### Practical Steps to Implement International Resume Standards\n\n#### 1. **Research Regional Differences**\n- **UK Standards:** Typically, a CV should be more detailed and can be longer than a US resume. Include a personal statement, education details, work experience, and skills.\n- **US Standards:** A resume is usually shorter and focuses on relevant experience, skills, and achievements. Use a reverse chronological order and include a summary or objective statement.\n\n#### 2. **Use Universal Keywords**\n- **Industry-Specific Terms:** Include keywords that are relevant to your industry and are commonly used in job postings.\n- **Action Verbs:** Use strong action verbs to describe your achievements and responsibilities.\n\n#### 3. **Format and Layout**\n- **Simple and Clean:** Use a simple and clean layout with standard fonts (Arial, Calibri, Times New Roman).\n- **Avoid Special Characters:** Stick to basic punctuation and avoid special characters, graphics, or tables.\n\n#### 4. **Tailor Your Content**\n- **Customize for Each Market:** Tailor your resume for each market by emphasizing the aspects that are most relevant to the job and the country's hiring preferences.\n- **Highlight Transferable Skills:** Emphasize transferable skills that are valuable in multiple markets, such as remote team leadership, project management, and strategic planning.\n\n### Example Structure for Both Markets\n\n#### **UK CV Example:**\n```markdown\n**Full Name**\nAddress\nPhone Number\nEmail Address\n\n**Personal Statement**\nDynamic Executive Producer with over 30 years of experience in television and film production, specializing in digital storytelling and remote team leadership. Proven track record of increasing viewership by 40% and managing cross-functional teams across multiple projects. Skilled in strategic planning, budget oversight, and fostering a collaborative work environment.\n\n**Education**\n- Bachelor of Arts in Film Production, [University Name], [Graduation Year]\n\n**Work Experience**\n- **Television/Film Producer**, [Company Name], [Dates]\n  - Led a remote team of 15 producers and coordinators, achieving a 95% on-time delivery rate.\n  - Implemented strategic planning initiatives that increased viewership by  40%.\n  - Oversaw budget management, ensuring cost-effective production while maintaining high-quality output.\n  - Facilitated cross-cultural communication and collaboration among international teams.\n\n**Skills**\n- Remote Team Leadership\n- Project Management\n- Strategic Planning\n- Budget Oversight\n- Digital Content Creation\n- Cross-Cultural Communication\n- Software Proficiency: Adobe Creative Suite, Final Cut Pro, Avid Media Composer\n\n**Certifications/Awards**\n- Certified in Digital Media Production and Storytelling Techniques\n- Award for Best Short Film, [Film Festival Name], [Year]\n```\n\n#### **US Resume Example:**\n```markdown\n**Full Name**\nAddress\nPhone Number\nEmail Address\n\n**Summary**\nDynamic Executive Producer with over 30 years of experience in television and film production, specializing in digital storytelling and remote team leadership. Proven track record of increasing viewership by 40% and managing cross-functional teams across multiple projects. Skilled in strategic planning, budget oversight, and fostering a collaborative work environment.\n\n**Professional Experience**\n- **Television/Film Producer**, [Company Name], [Dates]\n  - Led a remote team of 15 producers and coordinators, achieving a 95% on-time delivery rate.\n  - Implemented strategic planning initiatives that increased viewership by 40%.\n  - Oversaw budget management, ensuring cost-effective production while maintaining high-quality output.\n  - Facilitated cross-cultural communication and collaboration among international teams.\n\n**Education**\n- Bachelor of Arts in Film Production, [University Name], [Graduation Year]\n\n**Skills**\n- Remote Team Leadership\n- Project Management\n- Strategic Planning\n- Budget Oversight\n- Digital Content Creation\n- Cross-Cultural Communication\n- Software Proficiency: Adobe Creative Suite, Final Cut Pro, Avid Media Composer\n\n**Certifications/Awards**\n- Certified in Digital Media Production and Storytelling Techniques\n- Award for Best Short Film, [Film Festival Name], [Year]\n```\n\nBy following these guidelines and tailoring your resume to international standards, you can ensure that it is more likely to pass through ATS and appeal to a wider range of potential employers. This approach will help you stay competitive in both the UK and US markets.",
      id: 123,
      role: "assistant",
    },
    {
      content:
        "Always use quantified bullet points when I ask about resume content style. ->-> 3,22",
      id: 144,
      role: "user",
    },
    {
      content:
        "I'm trying to update my resume to highlight my leadership skills in remote work settings, as suggested by Nicole, a veteran producer I met at an industry panel on September 3, and I want to know how to effectively convey this experience ->-> 4,5",
      id: 158,
      role: "user",
    },
    {
      content:
        "I'm updating my portfolio and I noticed the number of mentees I've worked with has increased to 7, how can I effectively highlight this expansion of my mentoring activities in my resume? ->-> 4,21",
      id: 192,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "resume-improvement-areas",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 11,
        subtopics: [
          "ATS keyword optimization",
          "Action verb libraries",
          "Formatting for machine readability",
          "Industry-specific resume tailoring",
        ],
        theme:
          "Structuring, optimizing, and tailoring resumes for multiple industries and career stages",
        title:
          "Building a Portfolio-Ready Resume that Passes Any Applicant Tracking System",
      },
      narratives: "Resume improvement areas aggregation",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "Four areas: salary negotiation, portfolio project selection, resume international standards, and remote leadership skills.",
            question:
              "How many different areas have I focused on updating or improving based on my messages about my resume, portfolio, and salary negotiation?",
            question_id: "resume-improvement-areas",
            question_type: "multi_session_reasoning",
            source_chat_ids: [28, 72, 122, 158],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer improving resume and portfolio",
        user_relationships: "Alexis, Karen, Nicole",
      },
      user_questions: [],
    },
  ];
}

function buildEntertainmentSpendingOptimizationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm considering adding HBO Max to my subscriptions, which already include Netflix for $15.99/month and Disney+ for $7.99/month, do you think it's worth the $14.99/month for the exclusives? ->-> 1,10",
      id: 26,
      role: "user",
    },
    {
      content:
        "Adding HBO Max to your subscription lineup can definitely be worth it, especially if you're looking for a broader range of content, including exclusive movies, TV shows, and original series. Here are some factors to consider:\n\n### Pros of Adding HBO Max:\n1. **Exclusive Content**: HBO Max offers a variety of exclusive content, including popular shows like \"Stranger Things,\" \"Friends,\" \"Game of Thrones,\" and original series like \"Peacemaker\" and \"The White Lotus.\"\n2. **Family-Friendly Options**: HBO Max has a good selection of family-friendly content, including movies and shows that can appeal to a wide range of ages.\n3. **Comprehensive Library**: The platform has a vast library of movies and TV shows from various studios, including Warner Bros., DC Comics, and more.\n4. **Flexibility**: Having access to a wider range of content can make your streaming experience more versatile and enjoyable.\n\n### Cons of Adding HBO Max:\n1. **Cost**: At $14.99/month, HBO Max adds to your monthly streaming expenses. Combined with Netflix ($15.99/month) and Disney+ ($7.99/month), your total would be $40.87/month.\n2. **Overlap**: Some content might overlap with what you already have access to on Netflix and Disney+, so you'll need to evaluate the exclusives carefully.\n\n### Cost-Benefit Analysis:\n- **Current Total**: $15.99 (Netflix) + $7.99 (Disney+) = $23.98/month\n- **With HBO Max**: $23.98 + $14.99 = $38.97/month\n\n### Recommendations:\n1. **Trial Period**: Check if HBO Max offers a trial period. This can give you a chance to explore the content and decide if it's worth the investment.\n2. **Evaluate Exclusives**: Look at the exclusive content on HBO Max and determine if there are shows or movies you really want to watch that aren't available elsewhere.\n3. **Bundle Deals**: Sometimes, combining services can offer discounts. Check if there are any bundle deals that might reduce the overall cost.\n\n### Final Thoughts:\nIf you frequently find yourself wanting more content beyond what Netflix and Disney+ offer, and if you enjoy the exclusives on HBO Max, then it might be worth the additional cost. However, if you're already satisfied with your current offerings, you might want to hold off and re-evaluate later.\n\nWould you like to explore more about the specific exclusives on HBO Max or any other streaming services?",
      id: 27,
      role: "assistant",
    },
    {
      content:
        "I'm trying to plan a family movie night and I want to make sure the movies are suitable for everyone, so can you help me find some films that are rated PG-13 or lower, considering I have to avoid movies rated above PG-13 due to Michelle's age and content sensitivity for Francis? ->-> 1,11",
      id: 28,
      role: "user",
    },
    {
      content:
        "Absolutely, I can help you find some family-friendly movies that are rated PG-13 or lower. Given that you need to accommodate both Francis and Michelle, it's important to choose movies that are suitable for younger children while still being engaging for older viewers. Here are some great options:\n\n### PG-Rated Movies:\n1. **\"The Incredibles\" (2004)** - A thrilling superhero adventure with humor and heart.\n2. **\"Finding Nemo\" (2003)** - A captivating underwater journey with memorable characters and beautiful animation.\n3. **\"The Lion King\" (1994)** - A classic Disney tale with memorable songs and a heartwarming story.\n4. **\"Coco\" (2017)** - A visually stunning Pixar film about family, tradition, and following your dreams.\n5. **\"Moana\" (2016)** - An empowering Disney film about a young girl on a heroic journey across the ocean.\n6. **\"Zootopia\" (2016)** - A clever and adventurous Pixar film that explores themes of prejudice and acceptance.\n7. **\"Inside Out\" (2015)** - A visually inventive Pixar film that delves into the emotions inside a young girl's mind.\n8. **\"Paddington\" (2014)** - A charming story about a bear from Peru who finds a new home in London.\n9. **\"Paddington 2\" (2017)** - A sequel that continues the adventures of Paddington Bear with more humor and heart.\n10. **\"Despicable Me\" (2010)** - A hilarious and heartwarming story about a supervillain and his minions.\n\n### G-Rated Movies:\n1. **\"The Jungle Book\" (2016)** - A modern adaptation of the classic story with stunning visuals and a heartwarming narrative.\n2. **\"Ratatouille\" (2007)** - A Pixar film about a rat who dreams of becoming a chef.\n3. **\"Bambi\" (1942)** - A classic Disney animated film about a young deer growing up in the forest.\n4. **\"Beauty and the Beast\" (2017)** - A live-action adaptation of the classic Disney animated film.\n5. **\"Frozen\" (2013)** - A Disney classic with memorable songs and a powerful story about sisterhood.\n6. **\"Lion King\" (2019)** - A live-action adaptation of the classic Disney animated film.\n7. **\"Trolls\" (2016)** - Known for its catchy music and colorful characters, this movie is fun and energetic.\n8. **\"The Secret of Kells\" (2009)** - A beautifully animated film with a rich medieval setting and a young boy's quest to protect an ancient book.\n\nThese movies should provide a mix of adventure, humor, and heartwarming stories that are suitable for both Francis and Michelle. They are rated PG or G, ensuring that the content is appropriate for younger children.\n\nWould you like more recommendations or specific genres to consider?",
      id: 29,
      role: "assistant",
    },
    {
      content:
        "I prefer selecting movies available on platforms I already subscribe to, to avoid extra rental fees and stay within my $100 entertainment budget, can you recommend some family-friendly movies that fit this criteria? ->-> 1,20",
      id: 48,
      role: "user",
    },
    {
      content:
        "Absolutely! Given your preference to stay within your existing subscriptions and your $100 entertainment budget, here are some family-friendly movies available on popular streaming platforms like Netflix, Disney+, and Amazon Prime Video. These should help you maximize your entertainment without additional rental fees.\n\n### Netflix\n1. **\"The Incredibles\" (2004)**\n   - **Why:** A thrilling superhero adventure with humor and heart.\n   \n2. **\"Finding Nemo\" (2003)**\n   - **Why:** A captivating underwater journey with memorable characters and beautiful animation.\n   \n3. **\"The Lion King\" (1994)**\n   - **Why:** A classic Disney tale with memorable songs and a heartwarming story.\n   \n4. **\"Coco\" (2017)**\n   - **Why:** A visually stunning Pixar film about family, tradition, and following your dreams.\n   \n5. **\"Moana\" (2016)**\n   - **Why:** An empowering Disney film about a young girl on a heroic journey across the ocean.\n\n### Disney+\n1. **\"Zootopia\" (2016)**\n   - **Why:** A clever and adventurous Pixar film that explores themes of prejudice and acceptance.\n   \n2. **\"Inside Out\" (2015)**\n   - **Why:** A visually inventive Pixar film that delves into the emotions inside a young girl's mind.\n   \n3. **\"Paddington\" (2014) and \"Paddington 2\" (2_17)**\n   - **Why:** Charming stories about a bear from Peru who finds a new home in London, filled with warmth and humor.\n   \n4. **\"Despicable Me\" (2010)**\n   - **Why:** A hilarious and heartwarming story about a supervillain and his minions.\n\n### Amazon Prime Video\n1. **\"The Secret Life of Pets\" (2016)**\n   - **Why:** A fun and heartwarming animated film about pets' secret lives when their owners are away.\n   \n2. **\"The Jungle Book\" (2016)**\n   - **Why:** A modern adaptation of the classic story with stunning visuals and a heartwarming narrative.\n   \n3. **\"Ratatouille\" (2007)**\n   - **Why:** A Pixar film about a rat who dreams of becoming a chef.\n   \n4. **\"The Grand Budapest Hotel\" (2014)**\n   - **Why:** A unique visual style and vibrant color palette that will be enhanced by 4K HDR.\n\n### Additional Recommendations\n1. **\"Encanto\" (2021)**\n   - **Why:** A magical and heartwarming Disney film about a young girl discovering her powers and the secrets of her family.\n   \n2. **\"The Croods: A New Age\" (2020)**\n   - **Why:** A prehistoric adventure with humor and heart, continuing the story of the Crood family.\n\n### Budget Consideration\n- **Existing Subscriptions:**\n  - Netflix: $15.99/month\n  - Disney+: $7.99/month\n  - Amazon Prime Video: Included with Amazon Prime membership ($13.99/month)\n\nGiven your $100 budget, you can comfortably afford these subscriptions for several months, allowing you to enjoy a wide range of family-friendly movies without additional rental fees.\n\n### Summary\nHere are some family-friendly movies available on your existing subscriptions:\n- **Netflix:** \"The Incredibles,\" \"Finding Nemo,\" \"The Lion King,\" \"Coco,\" \"Moana\"\n- **Disney+:** \"Zootopia,\" \"Inside Out,\" \"Paddington,\" \"Paddington 2,\" \"Despicable Me\"\n- **Amazon Prime Video:** \"The Secret Life of Pets,\" \"The Jungle Book,\" \"Ratatouille,\" \"The Grand Budapest Hotel\"\n\nEnjoy your movie nights with these great family-friendly options!",
      id: 49,
      role: "assistant",
    },
    {
      content:
        "Always include platform availability details when I ask about movie options. ->-> 1,22",
      id: 52,
      role: "user",
    },
    {
      content:
        "I'm planning a family movie weekend and I've increased my snack budget to $65, so I can order themed cupcakes from The Sweet Spot bakery on Market Street, can you help me find some movies that fit my new budget and are available on platforms that allow simultaneous streaming on multiple devices? ->-> 2,6",
      id: 66,
      role: "user",
    },
    {
      content:
        "Always confirm allergy information when I ask about snack options. ->-> 2,23",
      id: 104,
      role: "user",
    },
    {
      content:
        "How can I save money on movie rentals like I did with \"Paddington 2\" where I saved $3.99 by renting instead of subscribing to Amazon Prime monthly plan? ->-> 3,14",
      id: 142,
      role: "user",
    },
    {
      content:
        "Always provide alternative movie suggestions when I ask about family-friendly options. ->-> 3,22",
      id: 158,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "entertainment-spending-optimization",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 19,
        subtopics: [
          "Popular family-friendly genres",
          "Award-winning films and hidden gems",
          "Age ratings and content advisories",
          "Streaming platform exclusives",
        ],
        theme:
          "Balancing entertainment value, age appropriateness, and availability across platforms",
        title:
          "Finding the Best Streaming Movies for a Family Weekend",
      },
      narratives: "Entertainment spending optimization reasoning",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "To optimize your monthly entertainment spending, maintain Netflix and Disney+ subscriptions for simultaneous streaming and family-friendly content, add HBO Max only if exclusive shows justify the extra cost, and use individual rentals like for \"Paddington 2\" to save money instead of subscribing to additional monthly plans. Allocate your snack budget within $65 for themed treats without increasing overall costs. This balances content variety, device access, and cost-efficiency.",
            question:
              "Considering my current streaming subscriptions, snack budget for a family movie weekend, and past rental savings, how can I optimize my total monthly entertainment spending while maximizing simultaneous streaming and exclusive content access?",
            question_id: "entertainment-spending-optimization",
            question_type: "multi_session_reasoning",
            source_chat_ids: [26, 27, 66, 142],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Parent planning family movie weekends",
        user_relationships: "Francis, Michelle",
      },
      user_questions: [],
    },
  ];
}

function buildPersonalStatementApplicationTypesBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to set a goal for myself to complete this multi-purpose personal statement, but I'm not sure how to make it work for academic, visa, and grant applications, can you give me some advice on how to make it happen, considering I aim to finish it by April 20, 2024 ->-> 1,6",
      id: 10,
      role: "user",
    },
    {
      content:
        "Absolutely, creating a multi-purpose personal statement that works for academic, visa, and grant applications can be streamlined with a strategic approach. Here are some steps and tips to help you achieve your goal of completing the statement by April 20, 2024:\n\n### Step-by-Step Plan\n\n1. **Define the Purpose and Audience**\n   - **Academic Applications**: Focus on educational background, relevant coursework, research experience, and future academic goals.\n   - **Visa Applications**: Emphasize your qualifications, intentions, and plans for returning to your home country after your stay.\n   - **Grant Applications**: Highlight your project ideas, financial needs, and how the grant will support your goals.\n\n2. **Identify Common Elements**\n   - **Background and Experience**: Your role as a TV/film producer, key achievements, and storytelling techniques.\n   - **Personal Growth**: Reflections on your journey, adaptability, and resilience.\n   - **Support System**: Acknowledgment of Tanya's support and its impact on your career.\n\n3. **Customize Sections**\n   - **Introduction**: Start with a brief introduction that sets the tone for the statement.\n   - **Professional Experience**: Detail your achievements and the impact of your work.\n   - **Storytelling Techniques**: Discuss insights from Bryan and how they have influenced your approach.\n   - **Self-Reflection and Growth**: Reflect on your journey and personal growth.\n   - **Support System**: Mention Tanya's support and its significance.\n   - **Future Goals**: Tailor this section to the specific application (academic, visa, or grant).\n\n4. **Draft and Revise**\n   - **Initial Draft**: Write the first draft incorporating all the elements.\n   - **Review and Revise**: Edit for clarity, coherence, and relevance. Ensure it aligns with the specific requirements of each type of application.\n   - **Feedback**: Share the draft with Tanya and other trusted individuals for feedback.\n\n5. **Finalize and Submit**\n   - **Polish**: Make final adjustments based on feedback.\n   - **Submit**: Ensure you meet the deadlines for each application.\n\n### Timeline\n\n- **March 15, 2024**: Begin drafting the initial version.\n- **March 25, 2024**: Complete the first draft and start reviewing.\n- **April 5, 2024**: Incorporate feedback and make necessary revisions.\n- **April 15, 2024**: Finalize the statement and prepare for submission.\n- **April 20, 2024**: Submit the completed personal statement.\n\n### Example Structure\n\n---\n\n**Introduction**\n\"As a dedicated TV/film producer with over [X] years of experience, I have consistently delivered high-quality content that resonates with audiences and garners critical acclaim. Currently earning an annual salary of $38,000, I have managed multiple award-winning projects, showcasing my strong project management skills and ability to lead diverse teams effectively.\"\n\n**Professional Experience**\n\"One pivotal moment in my career was attending the Montserrat Film Festival on January 12, 2023, where I had the privilege of hearing Bryan's insights on storytelling techniques. He emphasized the importance of narrative structure and character development, which has profoundly influenced my approach to filmmaking. By focusing on creating compelling narratives and well-rounded characters, I have been able to produce stories that not only entertain but also provoke thought and emotion. For example, in my latest project, 'The Journey,' I applied Bryan's technique of using non-linear storytelling to enhance the emotional depth of the narrative, resulting in a critically acclaimed film.\"\n\n**Self-Reflection and Growth**\n\"Reflecting on my journey, I recognize the importance of adaptability, resilience, and continuous learning in thriving within the dynamic landscape of the entertainment industry. These qualities have not only helped me navigate the challenges of producing but have also contributed to my personal growth.\"\n\n**Support System**\n\"Throughout this journey, I have been fortunate to have the unwavering support of Tanya, my partner of two years. Her encouragement and belief in my abilities have been instrumental in helping me pursue my career goals with confidence and determination.\"\n\n**Future Goals**\n\"Looking forward, I am eager to take on more challenging projects and contribute to the growth of emerging talent. With a solid foundation of experience and a commitment to excellence, I am excited to bring my unique perspective and skills to new challenges and opportunities.\"\n\n---\n\n### Customization Tips\n\n- **For Academic Applications**: Add details about your educational background, relevant coursework, and future academic goals.\n- **For Visa Applications**: Emphasize your qualifications, intentions, and plans for returning to your home country.\n- **For Grant Applications**: Highlight your project ideas, financial needs, and how the grant will support your goals.\n\nBy following this structured approach and timeline, you should be able to complete your multi-purpose personal statement by April 20, 2024. Good luck!",
      id: 11,
      role: "assistant",
    },
    {
      content:
        "Always format dates in the month-day-year style when I ask about deadlines. ->-> 1,22",
      id: 48,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that I won't be able to finish my personal statement on time, I mean I've already finished 90% of the draft by April 4 and celebrated with dinner at The Blue Lagoon restaurant, but what if I mess up the last 10%? ->-> 2,12",
      id: 78,
      role: "user",
    },
    {
      content:
        "I'm trying to reduce my word count from 1,200 to 900 words by April 20 for the grant application, can you help me prioritize what to cut without losing the essence of my story? ->-> 2,14",
      id: 82,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that rescheduling the professional editing session to April 18 at East Janethaven Writers’ Studio might affect my ability to finish my personal statement on time, can you help me prioritize my tasks ->-> 2,22",
      id: 98,
      role: "user",
    },
    {
      content:
        "I've decided to apply for a Canadian study visa instead of Jamaican due to better funding options, but I'm not sure how to explain this transition strategy in my personal statement, can you guide me on what to focus on for the June 1 application? ->-> 3,5",
      id: 114,
      role: "user",
    },
    {
      content:
        "I just accepted the part-time role starting June 1 to gain experience while studying, but now I'm wondering how this will impact my decision to apply for a Canadian study visa instead of Jamaican, can you help me weigh the pros and cons? ->-> 3,14",
      id: 130,
      role: "user",
    },
    {
      content:
        "Always provide exact times when I ask about appointments or meetings. ->-> 3,22",
      id: 152,
      role: "user",
    },
    {
      content:
        "I'm planning to join the Toronto Caribbean Cultural Association in September to ease my transition, and I've also been working on improving my academic writing skills, having completed 10 modules of a course by June 14, which helped me improve clarity and conciseness by 30% ->-> 4,10",
      id: 188,
      role: "user",
    },
    {
      content:
        "I recently joined the Toronto Caribbean Cultural Association on July 29 and attended my first meeting at 7 PM at Queen St. West, how can I effectively mention this community engagement in my personal statement to show my cultural adaptation and global perspectives? ->-> 5,10",
      id: 234,
      role: "user",
    },
    {
      content:
        "I'm thrilled that my personal statement helped secure 2nd place in Montserrat Media Awards, but how can I leverage this achievement to demonstrate my academic and professional growth in future applications? ->-> 5,22",
      id: 262,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "personal-statement-application-types",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 14,
        subtopics: [
          "Hook writing techniques",
          "Weaving academic and personal stories",
          "Addressing gaps and weaknesses",
          "Cultural context adaptation",
        ],
        theme:
          "Balancing personal narrative with professional credibility for academic, visa, and grant applications",
        title:
          "Designing a Multi-Purpose Personal Statement for Global Opportunities",
      },
      narratives: "Personal statement application types aggregation",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "You are planning to use your personal statement for three application types: academic, visa, and grant. You mentioned accepting a part-time role starting June 1, which might affect your decision between applying for a Canadian or Jamaican study visa.",
            question:
              "How many different application types am I planning to use my personal statement for, and which roles or plans did I mention that might affect my visa application choice?",
            question_id: "personal-statement-application-types",
            question_type: "multi_session_reasoning",
            source_chat_ids: [10, 82, 130],
          },
        ],
      },
      user_profile: {
        user_info:
          "USER PROFILE: Writer preparing a multi-purpose personal statement",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildWritingGroupDeadlineBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Always format dates as \"Month Day, Year\" when I ask about timeline details. ->-> 1,22",
      id: 66,
      role: "user",
    },
    {
      content:
        "Got it! I'll format dates as \"Month Day, Year\" when discussing timeline details. Let's apply this to your current plan to increase your weekly word count to 1,350 words.\n\n### Updated Plan with Date Formatting\n\n1. **Set Daily Goals**:\n   - **Daily Word Count**: To meet your weekly target of 1,350 words, you should aim to write 270 words per day if you write 5 days a week.\n   - **Consistency**: Aim to write at least 270 words each day to meet your weekly target.\n\n2. **Create a Writing Schedule**:\n   - **Specific Times**: Dedicate specific times each day for writing. For example:\n     - **Morning Session**: 30 minutes (aim for 135 words)\n     - **Afternoon Session**: 30 minutes (aim for 135 words)\n   - **Flexibility**: Allow for some flexibility in case you need extra time on certain days.\n\n3. **Use a Timer**:\n   - **Pomodoro Technique**: Use the Pomodoro Technique to stay focused. For example:\n     - **25 Minutes**: Write continuously for 25 minutes.\n     - **5 Minutes**: Take a 5-minute break.\n   - **Adjust as Needed**: You can adjust the timing based on what works best for you.\n\n4. **Track Your Progress**:\n   - **Daily Log**: Keep a daily log of your word count and progress.\n   - **Weekly Review**: At the end of each week, review your total word count and adjust your plan if necessary.\n\n5. **Set Reminders**:\n   - **Notifications**: Set reminders on your phone or computer to prompt you to start your writing sessions.\n   - **Visual Cues**: Place visual cues around your workspace to remind you of your writing goals.\n\n6. **Incorporate Writing into Your Routine**:\n   - **Morning Ritual**: Start your day with a writing session to get your creative juices flowing.\n   - **Evening Wind-Down**: Use your evening time to write and relax before bed.\n\n7. **Stay Motivated**:\n   - **Rewards**: Set small rewards for meeting your daily and weekly goals.\n   - **Positive Reinforcement**: Celebrate your progress and improvements, no matter how small.\n\n### Example Daily Routine\n\n1. **Morning Session**:\n   - **March 6, 2023**: 9:00 AM - 9:30 AM: Write for 30 minutes (aim for 135 words).\n   - **March 6, 2023**: 9:30 AM - 9:35 AM: Take a 5-minute break.\n\n2. **Afternoon Session**:\n   - **March 6, 2023**: 1:00 PM - 1:30 PM: Write for 30 minutes (aim for 135 words).\n   - **March 6, 2023**: 1:30 PM - 1:35 PM: Take a 5-minute break.\n\n3. **Evening Session**:\n   - **March 6, 2023**: 7:00 PM - 7:30 PM: Write for 30 minutes (aim for 135 words).\n   - **March 6, 2023**: 7:30 PM - 7:35 PM: Take a 5-minute break.\n\n### Example Progress Log\n\n| Date            | Day    | Task                | Words Written | Notes/Feedback |\n|-----------------|--------|---------------------|---------------|----------------|\n| March 6, 2023   | Mon    | Morning Session     | 135           |                |\n| March 6, 2023   | Mon    | Afternoon Session   | 135           |                |\n| March 6, 2023   | Mon    | Evening Session     | 135           |                |\n| March 7, 2023   | Tue    | Morning Session     | 135           |                |\n| March 7, 2023   | Tue    | Afternoon Session   | 135           |                |\n| March 7, 2023   | Tue    | Evening Session     | 135           |                |\n| March 8, 2023   | Wed    | Morning Session     | 135           |                |\n| March 8, 2023   | Wed    | Afternoon Session   | 135           |                |\n| March 8, 2023   | Wed    | Evening Session     | 135           |                |\n| March 9, 2023   | Thu    | Morning Session     | 135           |                |\n| March 9, 2023   | Thu    | Afternoon Session   | 135           |                |\n| March 9, 2023   | Thu    | Evening Session     | 135           |                |\n| March 10, 2023  | Fri    | Morning Session     | 135           |                |\n| March 10, 2023  | Fri    | Afternoon Session   | 135           |                |\n| March 10, 2023  | Fri    | Evening Session     | 135           |                |\n\n### Conclusion\n\nBy setting daily goals, creating a consistent writing schedule, tracking your progress, and staying motivated, you can effectively meet your new weekly word count target of 1,350 words. Let me know if you need further assistance or have any additional questions!",
      id: 67,
      role: "assistant",
    },
    {
      content:
        "I'm kinda worried about meeting my April 20 deadline for the peer-reviewed draft submission to the local writing group, so can you help me prioritize my editing tasks to ensure I cut wordiness by 15% as planned? ->-> 2,7",
      id: 86,
      role: "user",
    },
    {
      content:
        "I'm kinda stuck after experiencing a 2-day creative block from April 4-5, but I managed to resolve it by changing my writing location to Montserrat Public Park - can you help me figure out how to avoid such blocks in the future? ->-> 2,18",
      id: 144,
      role: "user",
    },
    {
      content:
        "Certainly! Creative blocks can be frustrating, but there are several strategies you can employ to avoid or mitigate them in the future. Here are some tips to help you maintain your creative flow:\n\n### Strategies to Avoid Creative Blocks\n\n1. **Change Your Environment**\n   - **Purpose**: Sometimes a change of scenery can spark creativity.\n   - **Implementation**: Regularly change your writing location. If you usually write at home, try a coffee shop, park, or library. Montserrat Public Park seems to have worked well for you, so consider making this a regular part of your routine.\n\n2. **Establish a Consistent Routine**\n   - **Purpose**: A consistent routine can help establish a writing habit and reduce the likelihood of creative blocks.\n   - **Implementation**: Set specific times each day for writing. For example, 2 hours every Monday, Wednesday, and Friday at 7 PM. Stick to this schedule as much as possible.\n\n3. **Take Regular Breaks**\n   - **Purpose**: Regular breaks can prevent burnout and maintain focus.\n   - **Implementation**: Take short breaks every hour (e.g., 5-10 minutes) to stretch, hydrate, or simply step away from your work. Longer breaks on weekends can also help recharge your creative energy.\n\n4. **Use Writing Prompts**\n   - **Purpose**: Writing prompts can help stimulate creativity and provide a starting point when you're feeling stuck.\n   - **Implementation**: Use online resources or books with writing prompts to generate new ideas. Spend a few minutes each day exploring different prompts.\n\n5. **Engage in Creative Activities Outside of Writing**\n   - **Purpose**: Engaging in other creative activities can help keep your mind active and inspire new ideas.\n   - **Implementation**: Try activities like drawing, painting, photography, or even listening to music. These can provide a fresh perspective and spark creativity.\n\n6. **Exercise Regularly**\n   - **Purpose**: Physical activity can improve mental health and stimulate creativity.\n   - **Implementation**: Incorporate regular exercise into your routine, such as walking, jogging, yoga, or any other form of physical activity you enjoy.\n\n7. **Mindfulness and Meditation**\n   - **Purpose**: Mindfulness and meditation can help clear your mind and reduce stress, which can lead to creative blocks.\n   - **Implementation**: Spend a few minutes each day practicing mindfulness or meditation. Apps like Headspace or Calm can guide you through these practices.\n\n8. **Journaling**\n   - **Purpose**: Journaling can help you process your thoughts and emotions, which can be a source of creative inspiration.\n   - **Implementation**: Keep a journal where you write about your day, your feelings, or any ideas that come to mind. This can be a separate activity from your main writing project.\n\n9. **Peer Support and Feedback**\n   - **Purpose**: Getting feedback from peers can provide new perspectives and help you overcome creative blocks.\n   - **Implementation**: Share your work with trusted peers or join a writing group. Regular feedback can help you stay motivated and inspired.\n\n### Example Workflow\n\n#### Week 1: Establishing a Routine\n- **Day 1-2**: Set a consistent writing schedule (e.g., 2 hours every Monday, Wednesday, and Friday at 7 PM).\n- **Day 3-4**: Change your writing location to Montserrat Public Park or another inspiring place.\n- **Day 5**: Take a short break every hour and engage in a creative activity outside of writing.\n\n#### Week 2: Maintaining Creativity\n- **Day 1-2**: Use writing prompts to generate new ideas.\n- **Day 3-4**: Engage in physical activity or mindfulness exercises.\n- **Day 5**: Journal about your thoughts and emotions.\n\n#### Week 3: Continuous Improvement\n- **Day 1-2**: Share your work with peers for feedback.\n- **Day 3-4**: Reflect on your progress and make adjustments to your routine as needed.\n- **Day 5**: Take a longer break to recharge.\n\n### Conclusion\n\nBy implementing these strategies, you can help prevent creative blocks and maintain a steady flow of ideas. Changing your environment, establishing a consistent routine, taking regular breaks, and engaging in other creative activities can all contribute to a more productive and enjoyable writing experience.\n\nWould you like any specific guidance on implementing any of these strategies or any other aspects of your writing process?",
      id: 145,
      role: "assistant",
    },
    {
      content:
        "I'm kinda worried that I won't meet the new April 25 deadline, can you help me create a schedule to fit in the extra peer review feedback ->-> 2,22",
      id: 168,
      role: "user",
    },
    {
      content:
        "That sounds like a solid plan! I'll follow this schedule to make sure I incorporate the peer feedback and hit my word count goals. I appreciate the detailed breakdown and the tips on staying flexible and taking breaks. Let's do this!\n\nThanks for the help!",
      id: 170,
      role: "user",
    },
    {
      content:
        "I've added Saturday 10 AM sessions to my writing schedule starting May 18 to accommodate my editing workload, and I'm hoping this will help me stay on track, but I'd love some advice on how to make the most of these new sessions ->-> 3,7",
      id: 188,
      role: "user",
    },
    {
      content:
        "Adding Saturday 10 AM sessions to your writing schedule is a great step towards managing your editing workload more effectively. Here are some strategies to help you make the most of these new sessions:\n\n1. **Set Clear Objectives**:\n   - **Define Goals**: Before each session, define specific goals for what you want to achieve. Whether it's revising a certain number of paragraphs, reducing passive voice, or improving clarity, having clear objectives will help you stay focused.\n   - **Prioritize Tasks**: Prioritize the most important tasks that need attention. For example, if you need to reduce passive voice, focus on identifying and rewriting passive sentences first.\n\n2. **Create a Structured Routine**:\n   - **Warm-Up Exercises**: Start each session with a brief warm-up exercise to get your mind in the right frame. This could be a quick writing prompt, a short meditation, or a few minutes of light stretching.\n   - **Timed Blocks**: Use the Pomodoro Technique or similar time-blocking methods. For example, work for 25 minutes, then take a 5-minute break. This can help you maintain focus and avoid burnout.\n\n3. **Use Writing Tools Effectively**:\n   - **Grammarly and Hemingway Editor**: Utilize tools like Grammarly and Hemingway Editor to identify and correct passive voice, awkward phrasing, and other issues. These tools can provide immediate feedback and suggestions.\n   - **Checklists**: Develop a checklist of common editing tasks, such as checking for passive voice, ensuring clarity, and maintaining tone consistency. Refer to this checklist during your sessions.\n\n4. **Stay Organized**:\n   - **Organize Your Workspace**: Ensure your workspace is conducive to productive writing. Have all necessary materials and tools readily available.\n   - **Digital Organization**: Use digital tools like Google Docs or Scrivener to organize your drafts and notes. Version control features can be particularly useful for tracking changes and progress.\n\n5. **Incorporate Peer Feedback**:\n   - **Regular Reviews**: Schedule regular peer review sessions with Joseph or Amy. Their feedback can provide new perspectives and help you identify areas for improvement.\n   - **Specific Requests**: When sharing your work for review, specify the areas you are focusing on, such as reducing passive voice or improving clarity. This can help reviewers provide more targeted feedback.\n\n6. **Reflect and Adjust**:\n   - **Post-Session Reflection**: After each session, take a few minutes to reflect on what you accomplished and what you could improve. Note any challenges you faced and how you can address them in future sessions.\n   - **Adjust Strategies**: Be flexible and willing to adjust your strategies based on what works best for you. If you find certain techniques are not effective, try something different.\n\n7. **Maintain Motivation**:\n   - **Celebrate Small Wins**: Acknowledge and celebrate small victories along the way. Each improvement, no matter how minor, is a step forward.\n   - **Stay Inspired**: Keep yourself inspired by reading works by authors you admire or attending writing workshops and webinars. Inspiration can fuel your motivation and creativity.\n\n8. **Balance and Well-being**:\n   - **Take Breaks**: Ensure you take regular breaks to rest and recharge. Overworking can lead to burnout and decreased productivity.\n   - **Maintain a Healthy Lifestyle**: Continue to prioritize healthy habits such as regular exercise, a balanced diet, and adequate sleep. These factors can significantly impact your mental and physical well-being.\n\nBy implementing these strategies, you can make the most of your new Saturday 10 AM sessions and continue to improve your writing and editing skills. Keep up the good work, and remember to be patient and kind to yourself throughout the process.",
      id: 189,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "writing-group-deadline",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 15,
        subtopics: [
          "Grammar and syntax auditing",
          "Clarity vs. concision trade-offs",
          "Tone calibration",
          "Editing checklists",
        ],
        theme:
          "Techniques, tools, and mental models for refining writing quality over time",
        title:
          "Developing a Self-Editing System for Lifelong Writing Improvement",
      },
      narratives: "Writing group deadline knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "April 25",
            question:
              "What deadline should I aim for to submit my peer-reviewed draft to the local writing group?",
            question_id: "writing-group-deadline",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[86],"updated_info":[168,170]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Writer revising a peer-reviewed draft",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildTwoFactorAuthImplementationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda concerned about the security of our AI platform, so I was wondering if two-factor authentication, which we implemented on April 20, is enough to prevent data breaches, especially since we enrolled our HR team in that May 15 online course on ethical AI hiring practices by AI Now Institute ->-> 2,16",
      id: 136,
      role: "user",
    },
    {
      content:
        "I've been thinking about the potential risks, and I'm not sure if our security measures, like the two-factor authentication we set up on April 20, are sufficient to protect our data, can you help me assess that ->-> 2,17",
      id: 142,
      role: "user",
    },
    {
      content:
        "What's the best way to ensure the AI screening tool's 90% accuracy doesn't introduce bias into my hiring process, especially considering I've never implemented two-factor authentication for any platform access? ->-> 2,22",
      id: 170,
      role: "user",
    },
    {
      content:
        "Sure, let's proceed with sending the meeting invite and setting up the initial security training. I'll make sure to enable 2FA for all platforms and user accounts and conduct those initial bias audits. Looking forward to the meeting on June 5!",
      id: 174,
      role: "user",
    },
    {
      content:
        "Sure, let's proceed with sending the meeting invite and setting up the initial security training. I'll make sure to enable 2FA for all platforms and user accounts and conduct those initial bias audits. Looking forward to the meeting on June 5!",
      id: 180,
      role: "user",
    },
    {
      content:
        "Sure, let's send the meeting invite and set up the training. I'll make sure to enable 2FA and conduct the bias audits as planned. Looking forward to the meeting on June 5!",
      id: 182,
      role: "user",
    },
    {
      content:
        "I'm considering using AI to automate hiring in my company, but I want to make sure I'm taking the right security measures, like the added biometric login for the AI platform that was implemented on October 2, to enhance access security ->-> 4,16",
      id: 306,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "two-factor-auth-implementation",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 16,
        subtopics: [
          "Understanding AI hiring algorithms",
          "Risks of algorithmic bias and discrimination",
          "Legal compliance in different regions",
          "Transparency and explainability requirements",
        ],
        theme:
          "Balancing efficiency with fairness, privacy, and bias concerns in recruitment",
        title:
          "Deciding Whether to Use AI to Automate Hiring in My Company",
      },
      narratives: "Two-factor authentication implementation contradiction",
      probing_questions: {
        contradiction_resolution: [
          {
            answer: "It depends",
            question:
              "Have I ever implemented two-factor authentication for platform access?",
            question_id: "two-factor-auth-implementation",
            question_type: "contradiction_resolution",
            source_chat_ids: {"first_statement":[142],"second_statement":[180,182]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Founder securing an AI hiring platform",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildFinalDecisionMeetingBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm deciding between a $95,000 offer from a streaming startup and my current $85,000 job, can you help me weigh the pros and cons of each option? ->-> 1,9",
      id: 38,
      role: "user",
    },
    {
      content:
        "Thanks for breaking it down! I think I'll lean towards the startup for the higher salary and the potential for growth. The innovative environment and new challenges sound exciting. I'll just need to make sure I can handle the workload and pressure. I might talk to some of my colleagues about their experiences with startups too. What do you think about that plan?",
      id: 40,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about making the right decision on March 30, so I rescheduled my final meeting to have more time, but I'm not sure if it's gonna help ->-> 1,21",
      id: 64,
      role: "user",
    },
    {
      content:
        "Always provide detailed summaries when I ask about philosophical concepts. ->-> 1,22",
      id: 66,
      role: "user",
    },
    {
      content:
        "I rescheduled a call with Matthew from April 4 to April 6, and I'm wondering if that was a good time management decision, considering I had to prepare for my first startup meeting, what do you think? ->-> 2,9",
      id: 84,
      role: "user",
    },
    {
      content:
        "Always confirm dates when I ask about scheduled events. ->-> 3,22",
      id: 264,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "final-decision-meeting",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 17,
        subtopics: [
          "Philosophical definitions of free will",
          "Determinism and scientific perspectives",
          "Compatibilism vs. incompatibilism",
          "Impact on personal responsibility",
        ],
        theme:
          "Weighing philosophical, scientific, and practical consequences of accepting or rejecting free will",
        title:
          "Considering Whether to Believe in and Live by the Idea of Free Will",
      },
      narratives: "Final decision meeting knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer:
              "The final decision meeting is scheduled for March 30 to allow more time for thorough evaluation.",
            question:
              "When is my final decision meeting scheduled to take place?",
            question_id: "final-decision-meeting",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[38,40],"updated_info":[64]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Professional weighing a startup offer",
        user_relationships: "Matthew",
      },
      user_questions: [],
    },
  ];
}

function buildBookSeriesGenresBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've allocated $120 for book purchases this winter and I'm looking to buy print editions from Montserrat Books on Main Street, can you suggest some must-read fiction series that fit my budget? ->-> 1,10",
      id: 34,
      role: "user",
    },
    {
      content:
        "Always provide detailed genre descriptions when I ask about book recommendations. ->-> 1,22",
      id: 62,
      role: "user",
    },
    {
      content:
        "I've been thinking of joining an online discussion like the one Wyatt organized on December 8 for \"The Poppy War\", which had 25 participants, to find my next favorite series ->-> 2,19",
      id: 130,
      role: "user",
    },
    {
      content:
        "I'm trying to decide on a must-read fiction series for winter evenings and I've been invited to co-host a live chat on sci-fi series with Wyatt on January 28, so I want to make sure I've got a good grasp on the genre ->-> 3,15",
      id: 190,
      role: "user",
    },
    {
      content:
        "I'm looking to spend my increased January book budget of $50 on a new series, can you recommend something that fits my winter evening reading preferences? ->-> 3,21",
      id: 204,
      role: "user",
    },
    {
      content:
        "Declining the TV pilot project to focus on your reading goals is a great decision, especially with the extra 15 hours you now have each week. To make the most of this time, you should look for a series that is both engaging and rich in storytelling and character development. Here are some recommendations that can fill your newfound time with captivating narratives:\n\n### Engaging Series with Rich Storytelling and Characters\n\n1. **\"A Song of Ice and Fire\" by George R.R. Martin**\n   - **Overview**: This series, also known as \"A Song of Ice and Fire,\" is the basis for the HBO series \"Game of Thrones.\" It features a complex web of political intrigue, family rivalries, and magical elements set in a richly detailed world.\n   - **Length**: The series currently consists of 5 books, with the latest being \"A Dance with Dragons.\" There are plans for more books in the series.\n   - **Why It Fits**: The intricate plotting and deep character development will keep you engaged for many hours. The series is known for its unexpected twists and turns, making it a perfect fit for your extra time.\n\n2. **\"The Wheel of Time\" by Robert Jordan**\n   - **Overview**: This epic fantasy series follows a group of young people who are drawn into a world of magic and prophecy. The series is known for its extensive world-building and complex characters.\n   - **Length**: The series originally consisted of 14 books, with the final book being published posthumously by Brandon Sanderson. There are plans for additional books.\n   - **Why It Fits**: The series is vast and detailed, providing ample material to fill your 15 hours each week. The rich storytelling and diverse cast of characters will keep you immersed in the narrative.\n\n3. **\"The Malazan Book of the Fallen\" by Steven Erikson**\n   - **Overview**: This series is a sprawling epic fantasy that follows the rise and fall of empires, the machinations of gods, and the struggles of mortals caught in the middle. The series is known for its complex plot and intricate world-building.\n   - **Length**: The series consists of 10 books, with the latest being \"Dust of Dreams.\"\n   - **Why It Fits**: The series is dense and detailed, offering a wealth of material to explore. The deep character development and intricate plotting will keep you engaged for many hours.\n\n4. **\"The Chronicles of Narnia\" by C.S. Lewis**\n   - **Overview**: This series is a classic of children's literature, but it has a broad appeal and can be enjoyed by readers of all ages. The series follows the adventures of four siblings who discover a magical world called Narnia.\n   - **Length**: The series consists of 7 books, with the latest being \"The Last Battle.\"\n   - **Why It Fits**: The series is shorter in terms of individual book length but offers a rich and imaginative world to explore. The moral and philosophical themes will provide a thoughtful and engaging reading experience.\n\n5.  **\"The Dresden Files\" by Jim Butcher**\n   - **Overview**: This urban fantasy series follows Harry Dresden, a professional wizard and private investigator in modern-day Chicago. The series blends elements of mystery, action, and supernatural thriller.\n   - **Length**: The series consists of 15 books, with the latest being \"Side Jobs.\"\n   - **Why It Fits**: The series is fast-paced and engaging, with a strong central character and a rich supporting cast. The blend of mystery and supernatural elements will keep you entertained for many hours.\n\n### Next Steps\n\n1. **Choose a Series**: Based on your interests and the recommendations above, select a series that you think will be the most engaging and fulfilling for your extra time.\n   \n2. **Check Availability**: Verify the availability of the series in your preferred format (print, e-book, or audiobook). Ensure that you can access all the books in the series.\n\n3. **Plan Your Reading Schedule**: With 15 extra hours each week, you can read a significant portion of a long series. Plan how much you can read each day or week to make steady progress.\n\n4. **Prepare for Discussion**: If you plan to discuss the series with your book club or friends, prepare some discussion questions in advance. This will help facilitate a lively and insightful conversation.\n\nBy choosing a series that is both engaging and rich in storytelling, you can make the most of your extra time and enjoy a fulfilling reading experience. Enjoy your winter evenings with these captivating series!",
      id: 229,
      role: "assistant",
    },
    {
      content:
        "Always suggest related literary events when I ask about book series recommendations. ->-> 5,23",
      id: 306,
      role: "user",
    },
    {
      content:
        "Starting to post book reviews on platforms like Goodreads can be a rewarding experience. Not only does it help you track your reading progress, but it also allows you to share your thoughts and discoveries with others. Here are some reasons why you should consider posting reviews and some tips on how to get started:\n\n### Benefits of Posting Book Reviews\n\n1. **Track Your Progress**: Keeping a record of the books you read and your thoughts about them can help you remember what you've read and how you felt about each book.\n2. **Discover New Books**: Reading reviews from others can expose you to new books and authors you might not have discovered otherwise.\n3. **Engage with the Community**: Participating in discussions and connecting with other readers can enrich your reading experience and provide new perspectives.\n4. **Improve Your Writing Skills**: Regularly writing reviews can help you develop your writing skills and become more articulate in expressing your thoughts and opinions.\n\n### Tips for Getting Started\n\n1. **Create an Account**: Sign up for Goodreads or another platform where you can post reviews.\n2. **Add Books to Your Shelf**: Start by adding the books you have read or are currently reading to your \"Shelf\" on Goodreads.\n3. **Write Your First Review**: Begin with a book you have recently finished and write a brief review. Here are some elements to include:\n   - **Summary**: A brief overview of the book without giving away major spoilers.\n   - **Your Thoughts**: Share your impressions, what you liked or didn't like, and any standout moments.\n   - **Rating**: Give the book a rating out of 5 stars.\n   - **Recommendations**: Mention who might enjoy the book and why.\n\n4. **Be Honest and Constructive**: Be honest about your feelings towards the book, but also be constructive. Even if you didn't enjoy a book, explain why and what could have improved it.\n5. **Engage with Others**: Read and respond to reviews from other users. Engaging in discussions can help you discover new books and authors.\n6. **Consistency**: Try to post reviews regularly to keep track of your reading and to stay active in the community.\n\n### Example Review\n\nHere's an example of how you might write a review for \"The Nightingale\" by Kristin Hannah:\n\n---\n\n**Title**: The Nightingale by Kristin Hannah\n\n**Rating**: 5 stars\n\n**Summary**: \"The Nightingale\" is a powerful and emotional novel set during World War II, focusing on the lives of two sisters in occupied France. The story explores themes of courage, sacrifice, and resilience.\n\n**Your Thoughts**: I was deeply moved by the strength and determination of the characters, especially Vianne and Isabelle. The historical context is richly detailed, and the emotional depth of the story kept me engaged from start to finish. The narrative is beautifully crafted, and the characters are incredibly well-developed.\n\n**Recommendations**: I highly recommend this book to anyone who enjoys historical fiction and stories that explore the human spirit during times of adversity. It's a must-read for fans of \"The Pillars of the Earth\" and \"Outlander.\"\n\n---\n\n### Conclusion\n\nStarting to post book reviews on platforms like Goodreads can be a fulfilling way to track your reading progress, share your thoughts, and discover new books and authors. It also allows you to engage with a vibrant community of readers who share your passion for books. Give it a try and see how it enhances your reading experience!",
      id: 309,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "book-series-genres",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 18,
        subtopics: [
          "Popular fantasy, sci-fi, and historical fiction series",
          "Standalone novels vs. multi-book sagas",
          "Award-winning authors and emerging voices",
          "Balancing page count with storytelling depth",
        ],
        theme:
          "Exploring different genres to find a captivating long-form reading experience",
        title:
          "Selecting a Must-Read Fiction Series for Winter Evenings",
      },
      narratives: "Book series and genres aggregation",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "Four different series or genres: three fiction series from Montserrat Books and one sci-fi series for the live chat.",
            question:
              "How many different book series or genres have I mentioned wanting to explore across my conversations?",
            question_id: "book-series-genres",
            question_type: "multi_session_reasoning",
            source_chat_ids: [34,130,190],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Reader planning winter book purchases",
        user_relationships: "Wyatt",
      },
      user_questions: [],
    },
  ];
}

function buildTransactionDeploymentWeeksBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm working on a project with a Time Anchor of March 15, 2024, and I need to plan my tasks accordingly, can you help me create a schedule to ensure I meet my deadlines by then? ->-> 1,1",
      id: 0,
      role: "user",
    },
    {
      content:
        "Sure, let's break it down for my budget tracker project. \n\n### Components:\n1. **User Authentication**\n   - Registration\n   - Login\n   - Logout\n\n2. **Transaction Management**\n   - Add Income\n   - Add Expense\n   - View Transactions\n\n3. **Basic Analytics**\n   - Monthly Summary\n   - Category-wise Spending\n\n### Milestones:\n- **Nov 1 - Nov 15, 2023:** Setup Flask project, virtual environment, and initial database schema.\n- **Nov 16 - Dec 15, 2023:** Implement user authentication (registration, login, logout).\n- **Dec 16, 2023 - Jan 15, 2024:** Develop transaction management features (add income, add expense, view transactions).\n- **Jan 16 - Feb 15, 2024:** Integrate basic analytics (monthly summary, category-wise spending).\n- **Feb 16 - Mar 15, 2024:** Final adjustments, testing, and deployment.\n\nDoes this breakdown work for you?",
      id: 2,
      role: "user",
    },
    {
      content:
        "Yes, this breakdown works well! Let's refine the schedule and ensure each component is covered with specific tasks and timelines. Here's a detailed plan for your budget tracker project:\n\n### Detailed Schedule\n\n#### **Nov 1 - Nov 15, 2023: Setup Flask Project**\n- **Task 1:** Set up the development environment (Flask, virtual environment).\n- **Task 2:** Initialize the project structure.\n- **Task 3:** Create the initial database schema (users table).\n\n#### **Nov 16 - Dec 15, 2023: User Authentication**\n- **Task 1:** Implement user registration.\n- **Task 2:** Implement user login.\n- **Task 3:** Implement user logout.\n- **Task 4:** Add validation and error handling for authentication processes.\n\n#### **Dec 16, 2023 - Jan 15, 2024: Transaction Management**\n- **Task 1:** Create tables for income and expenses in the database.\n- **Task 2:** Implement functionality to add income.\n- **Task 3:** Implement functionality to add expenses.\n- **Task 4:** Implement functionality to view transactions.\n- **Task 5:** Add validation and error handling for transaction management.\n\n#### **Jan 16 - Feb 15, 2024: Basic Analytics**\n- **Task 1:** Implement monthly summary generation.\n- **Task 2:** Implement category-wise spending analysis.\n- **Task 3:** Display analytics on the user interface.\n- **Task 4:** Add validation and error handling for analytics.\n\n#### **Feb 16 - Mar 15, 2024: Final Adjustments, Testing, and Deployment**\n- **Task 1:** Conduct thorough testing (unit tests, integration tests).\n- **Task 2:** Fix any bugs identified during testing.\n- **Task 3:** Optimize performance and security.\n- **Task 4:** Prepare for deployment (configure server, set up hosting).\n- **Task 5:** Deploy the application.\n- **Task 6:** Finalize documentation and user guides.\n\n### Milestones Recap\n- **Nov 15, 2023:** Initial setup and database schema.\n- **Dec 15, 2023:** User authentication implemented.\n- **Jan 15, 2024:** Transaction management features developed.\n- **Feb 15, 2024:** Basic analytics integrated.\n- **Mar 15, 2024:** Final adjustments, testing, and deployment completed.\n\nThis schedule should help you stay on track and meet your deadline. If you need further details or adjustments, feel free to let me know!",
      id: 3,
      role: "assistant",
    },
    {
      content:
        "Of course! Let's create a detailed schedule to ensure you meet the April 15, 2024, deadline for your MVP scope, which includes income/expense tracking, user login, and basic analytics. We'll break down the project into phases and assign specific tasks and milestones to each phase.\n\n### Project Phases and Timeline\n\n#### Phase 1: Initial Setup and Planning (November 1 - November 15, 2023)\n- **Task 1:** Set up the development environment (Flask, virtual environment).\n- **Task 2:** Initialize the project structure.\n- **Task 3:** Create the initial database schema (users table).\n\n#### Phase 2: User Authentication (November 16 - December 15, 2023)\n- **Task 1:** Implement user registration.\n- **Task 2:** Implement user login.\n- **Task 3:** Implement user logout.\n- **Task 4:** Add validation and error handling for authentication processes.\n\n#### Phase 3: Transaction Management (December 16, 2023 - January 15, 2024)\n- **Task 1:** Create tables for income and expenses in the database.\n- **Task 2:** Implement functionality to add income.\n- **Task 3:** Implement functionality to add expenses.\n- **Task 4:** Implement functionality to view transactions.\n- **Task 5:** Add validation and error handling for transaction management.\n\n#### Phase 4: Basic Analytics (January 16 - February 15, 2024)\n- **Task 1:** Implement monthly summary generation.\n- **Task 2:** Implement category-wise spending analysis.\n- **Task 3:** Display analytics on the user interface.\n- **Task 4:** Add validation and error handling for analytics.\n\n#### Phase 5: Final Adjustments, Testing, and Deployment (February 16 - April 15, 2024)\n- **Task 1:** Conduct thorough testing (unit tests, integration tests).\n- **Task 2:** Fix any bugs identified during testing.\n- **Task 3:** Optimize performance and security.\n- **Task 4:** Prepare for deployment (configure server, set up hosting).\n- **Task 5:** Deploy the application.\n- **Task 6:** Finalize documentation and user guides.\n\n### Detailed Schedule\n\n#### **November 1 - November 15, 2023: Initial Setup and Planning**\n- **Task 1:** Set up the development environment (Flask, virtual environment).\n  - Install Flask, SQLAlchemy, and other dependencies.\n  - Initialize the project structure.\n- **Task 2:** Initialize the project structure.\n  - Create the project directory structure.\n  - Set up the `requirements.txt` file.\n- **Task 3:** Create the initial database schema (users table).\n  - Define the `User` model.\n  - Create the `users` table in the database.\n\n#### **November 16 - December 15, 2023: User Authentication**\n- **Task 1:** Implement user registration.\n  - Create the `/register` endpoint.\n  - Validate input data.\n  - Hash passwords before storing them.\n- **Task 2:** Implement user login.\n  - Create the `/login` endpoint.\n  - Validate input data.\n  - Check password hashes.\n- **Task 3:** Implement user logout.\n  - Create the `/logout` endpoint.\n  - Clear session data.\n- **Task 4:** Add validation and error handling for authentication processes.\n  - Ensure proper error messages are returned.\n  - Handle edge cases (e.g., duplicate usernames).\n\n#### **December 16, 2023 - January 15, 2024: Transaction Management**\n- **Task 1:** Create tables for income and expenses in the database.\n  - Define the `Expense` model.\n  - Create the `expenses` table in the database.\n- **Task 2:** Implement functionality to add income.\n  - Create the `/income` endpoint.\n  - Validate input data.\n  - Store income data in the database.\n- **Task 3:** Implement functionality to add expenses.\n  - Create the `/expenses` endpoint.\n  - Validate input data.\n  - Store expense data in the database.\n- **Task 4:** Implement functionality to view transactions.\n  - Create the `/transactions` endpoint.\n  - Retrieve and display transaction data.\n- **Task 5:** Add validation and error handling for transaction management.\n  - Ensure proper error messages are returned.\n  - Handle edge cases (e.g., invalid dates).\n\n#### **January 16 - February 15, 2024: Basic Analytics**\n- **Task 1:** Implement monthly summary generation.\n  - Create the `/monthly_summary` endpoint.\n  - Generate monthly summaries based on transaction data.\n- **Task 2:** Implement category-wise spending analysis.\n  - Create the `/category_spending` endpoint.\n  - Generate category-wise spending reports.\n- **Task 3:** Display analytics on the user interface.\n  - Integrate analytics data into the user interface.\n- **Task 4:** Add validation and error handling for analytics.\n  - Ensure proper error messages are returned.\n  - Handle edge cases (e.g., no transactions).\n\n#### **February 16 - April 15, 2024: Final Adjustments, Testing, and Deployment**\n- **Task 1:** Conduct thorough testing (unit tests, integration tests).\n  - Write unit tests for each module.\n  - Perform integration testing to ensure all components work together.\n- **Task 2:** Fix any bugs identified during testing.\n  - Address any issues found during testing.\n- **Task 3:** Optimize performance and security.\n  - Review and optimize code for performance.\n  - Ensure security measures are in place (e.g., input validation, secure hashing).\n- **Task 4:** Prepare for deployment (configure server, set up hosting).\n  - Set up the production environment.\n  - Configure the server and hosting.\n- **Task 5:** Deploy the application.\n  - Push the code to the production server.\n  - Ensure the application runs smoothly.\n- **Task 6:** Finalize documentation and user guides.\n  - Write comprehensive documentation.\n  - Create user guides for easy onboarding.\n\n### Milestones Recap\n- **November 15, 2023:** Initial setup and planning completed.\n- **December 15, 2023:** User authentication implemented.\n- **January 15, 2024:** Transaction management features developed.\n- **February 15, 2024:** Basic analytics integrated.\n- **April 15, 2024:** Final adjustments, testing, and deployment completed.\n\nThis schedule should help you stay on track and meet your deadline. If you need further details or adjustments, feel free to let me know!",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "I'm working on a project with scheduled two-week sprints, and the first sprint ends on March 29, focusing on user registration and login. I need to plan the sprint carefully to ensure we meet the deadline. Can you help me create a sprint plan that includes user registration and login features, considering we have only two weeks for this sprint? ->-> 1,14",
      id: 28,
      role: "user",
    },
    {
      content:
        "To keep your Flask app lightweight and easy to maintain while implementing essential features, you can focus on simplicity and avoid unnecessary dependencies. Here's a streamlined approach to building your personal budget tracker with Flask 2.3.1, SQLite 3.39, and a deadline of April 15.\n\n### Project Structure\n\nFirst, organize your project structure to keep things clean and manageable:\n\n```\nbudget_tracker/\n|-- app.py\n|-- models.py\n|-- routes.py\n|-- templates/\n|   |-- base.html\n|   |-- index.html\n|   |-- login.html\n|   |-- register.html\n|-- static/\n|   |-- css/\n|   |-- js/\n|-- migrations/\n```\n\n### Dependencies\n\nEnsure you have the necessary dependencies installed:\n\n```bash\npip install Flask Flask-SQLAlchemy Flask-Migrate Werkzeug\n```\n\n### Step-by-Step Implementation\n\n#### 1. Setup Flask App\n\nCreate `app.py` to initialize your Flask app and configure the database:\n\n```python\nfrom flask import Flask, render_template, request, redirect, url_for, flash\nfrom flask_sqlalchemy import SQLAlchemy\nfrom flask_migrate import Migrate\nfrom werkzeug.security import generate_password_hash, check_password_hash\n\napp = Flask(__name__)\napp.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///budget_tracker.db'\napp.config['SQLALCHEMY_TRACK_MODIFICATIONS']_ = False\napp.config['SECRET_KEY'] = 'your_secret_key'\n\ndb = SQLAlchemy(app)\nmigrate = Migrate(app, db)\n```\n\n#### 2. Define Models\n\nCreate `models.py` to define your database models:\n\n```python\nfrom app import db\n\nclass User(db.Model):\n    id = db.Column(db.Integer, primary_key=True)\n    username = db.Column(db.String(80), unique=True, nullable=False)\n    password_hash = db.Column(db.String(120), nullable=False)\n\nclass Transaction(db.Model):\n    id = db.Column(db.Integer, primary_key=True)\n    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)\n    type = db.Column(db.String(80), nullable=False)\n    amount = db.Column(db.Float, nullable=False)\n    date = db.Column(db.DateTime, nullable=False)\n```\n\n#### 3. Setup Routes\n\nCreate `routes.py` to define your routes:\n\n```python\nfrom flask import Blueprint, render_template, request, redirect, url_for, flash\nfrom app import db, User, Transaction\nfrom werkzeug.security import generate_password_hash, check_password_hash\n\nauth_bp = Blueprint('auth', __name__)\n\n@auth_bp.route('/register', methods=['GET', 'POST'])\ndef register():\n    if request.method == 'POST':\n        username = request.form['username']\n        password = request.form['password']\n        hashed_password = generate_password_hash(password)\n        user = User(username=username, password_hash=hashed_password)\n        db.session.add(user)\n        db.session.commit()\n        flash('Registration successful!', 'success')\n        return redirect(url_for('auth.login'))\n    return render_template('register.html')\n\n@auth_bp.route('/login', methods=['GET', 'POST'])\ndef login():\n    if request.method == 'POST':\n        username = request.form['username']\n        password = request.form['password']\n        user = User.query.filter_by(username=username).first()\n        if user and check_password_hash(user.password_hash, password):\n            flash('Login successful!', 'success')\n            return redirect(url_for('main.index'))\n        else:\n            flash('Invalid username or password.', 'danger')\n    return render_template('login.html')\n\nmain_bp = Blueprint('main', __name__)\n\n@main_bp.route('/')\ndef index():\n    return render_template('index.html')\n\n@main_bp.route('/add_transaction', methods=['GET', 'POST'])\ndef add_transaction():\n    if request.method == 'POST':\n        user_id = 1  # Simplified for MVP\n        transaction_type = request.form['type']\n        amount = float(request.form['amount'])\n        date = request.form['date']\n        transaction = Transaction(user_id=user_id, type=transaction_type, amount=amount, date=date)\n        db.session.add(transaction)\n        db.session.commit()\n        flash('Transaction added successfully!', 'success')\n        return redirect(url_for('main.index'))\n    return render_template('add_transaction.html')\n```\n\n#### 4. Initialize Blueprints\n\nIn `app.py`, initialize the blueprints and run the app:\n\n```python\nfrom routes import auth_bp, main_bp\n\napp.register_blueprint(auth_bp)\napp.register_blueprint(main_bp)\n\nif __name__ == '__main__':\n    with app.app_context():\n        db.create_all()\n    app.run(port=5000, debug=True)\n```\n\n#### 5. Create Templates\n\nCreate the necessary HTML templates in the `templates` directory:\n\n- `base.html`: Base template for inheritance.\n- `index.html`: Main dashboard.\n- `login.html`: Login form.\n- `register.html`: Registration form.\n- `add_transaction.html`: Form to add transactions.\n\n#### 6. Setup Migrations\n\nInitialize and run migrations:\n\n```bash\nflask db init\nflask db migrate -m \"Initial migration.\"\nflask db upgrade\n```\n\n### Summary\n\nBy following these steps, you can build a lightweight and maintainable Flask app for your personal budget tracker. Focus on simplicity and essential features to meet your deadline of April 15. This approach ensures you have a solid foundation for future enhancements while keeping the project manageable.",
      id: 35,
      role: "assistant",
    },
    {
      content:
        "Always provide security best practices when I ask about authentication or authorization features. ->-> 3,28",
      id: 184,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "transaction-deployment-weeks",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: [
          "Setting up Flask project structure",
          "Designing HTML/CSS UI",
          "Connecting SQLite database",
          "User authentication basics",
        ],
        theme:
          "Creating a basic app to track income and expenses with simple analytics",
        title:
          "Building a Personal Budget Tracker Web App in Python and Flask",
      },
      narratives: "Transaction management to deployment interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "I have exactly 4 weeks between finishing the transaction management features on January 15, 2024, and the final deployment deadline on March 15, 2024.",
            question:
              "How many weeks do I have between finishing the transaction management features and the final deployment deadline?",
            question_id: "transaction-deployment-weeks",
            question_type: "temporal_reasoning",
            source_chat_ids: {"first_event":[2],"second_event":[0]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Developer building a Flask budget tracker",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildTriangleProblemCountBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to classify triangles by sides and angles, and I've completed 10 classification problems, scoring 8/10 correct in identifying triangle types, but I'm having trouble understanding how to apply this to more complex problems, like the ones involving the Law of Cosines to find unknown angles in a triangle with sides 7, 9, 12 cm, so can you help me figure out how to use my knowledge of equilateral, isosceles, and scalene triangles to solve these kinds of problems? ->-> 1,12",
      id: 30,
      role: "user",
    },
    {
      content:
        "Certainly, Christina! Let's build on your existing knowledge of classifying triangles by sides and angles and apply it to more complex problems, such as using the Law of Cosines to find unknown angles in a triangle with sides 7 cm, 9 cm, and 12 cm.\n\n### Review of Triangle Classification\n1. **Equilateral Triangle**: All three sides are equal, and all angles are 60 degrees.\n2. **Isosceles Triangle**: At least two sides are equal, and the angles opposite the equal sides are also equal.\n3. **Scalene Triangle**: No sides are equal, and no angles are equal.\n\n### Applying Knowledge to Complex Problems\n\n#### Step 1: Classify the Triangle by Sides\nGiven the sides 7 cm, 9 cm, and 12 cm:\n- No sides are equal.\n\nTherefore, this triangle is a **scalene triangle**.\n\n#### Step 2: Use the Law of Cosines to Find Unknown Angles\nTo find an unknown angle in a scalene triangle, we can use the Law of Cosines. Let's find the angle opposite the longest side, which is 12 cm. We'll denote this angle as \\(C\\).\n\nThe Law of Cosines states:\n\\[\nc^2 = a^2 + b^2 - 2ab \\cos(C)\n\\]\n\nRearranging to solve for \\(\\cos(C)\\):\n\\[\n\\cos(C) = \\frac{a^2 + b^2 - c^2}{2ab}\n\\]\n\nGiven:\n- \\(a = 7\\)\n- \\(b = 9\\)\n- \\(c = 12\\)\n\nSubstitute these values into the formula:\n\\[\n\\cos(C) = \\frac{7^2 + 9^2 - 12^2}{2 \\cdot 7 \\cdot 9}\n\\]\n\nCalculate the squares:\n\\[\n7^2 = 49\n\\]\n\\[\n9^2 = 81\n\\]\n\\[\n12^2 = 144\n\\]\n\nSubstitute these values back into the formula:\n\\[\n\\cos(C) = \\frac{49 + 81 - 144}{2 \\cdot 7 \\cdot 9}\n\\]\n\nPerform the arithmetic inside the numerator:\n\\[\n49 + 81 - 144 = 130 - 144 = -14\n\\]\n\nCalculate the denominator:\n\\[\n2 \\cdot 7 \\cdot 9 = 126\n\\]\n\nCombine the results:\n\\[\n\\cos(C) = \\frac{-14}{126} = -\\frac{1}{9}\n\\]\n\nFind the angle \\(C\\) using the inverse cosine function:\n\\[\nC = \\cos^{-1}\\left(-\\frac{1}{9}\\right)\n\\]\n\nUsing a calculator:\n\\[\nC \\approx \\cos^{-1}\\left(-\\frac{1}{9}\\right) \\approx 96.38^\\circ\n\\]\n\n#### Step 3: Find the Other Angles\nTo find the other two angles, we can use the fact that the sum of the angles in a triangle is 180 degrees. Let's denote the other two angles as \\(A\\) and \\(B\\).\n\nUsing the Law of Cosines again, we can find angle \\(A\\) opposite side \\(a = 7\\):\n\\[\na^2 = b^2 + c^2 - 2bc \\cos(A)\n\\]\n\\[\n7^2 = 9^2 + 12^2 - 2 \\cdot 9 \\cdot 12 \\cos(A)\n\\]\n\\[\n49 = 81 + 144 - 216 \\cos(A)\n\\]\n\\[\n49 = 225 - 216 \\cos(A)\n\\]\n\\[\n216 \\cos(A) = 176\n\\]\n\\[\n\\cos(A) = \\frac{176}{216} = \\frac{22}{27}\n\\]\n\\[\nA = \\cos^{-1}\\left(\\frac{22}{27}\\right) \\approx 33.56^\\circ\n\\]\n\nSimilarly, for angle \\(B\\) opposite side \\(b = 9\\):\n\\[\nb^2 = a^2 + c^2 - 2ac \\cos(B)\n\\]\n\\[\n9^2 = 7^2 + 12^2 - 2 \\cdot 7 \\cdot 12 \\cos(B)\n\\]\n\\[\n81 = 49 + 144 - 168 \\cos(B)\n\\]\n\\[\n81 = 193 - 168 \\cos(B)\n\\]\n\\[\n168 \\cos(B) = 112\n\\]\n\\[\n\\cos(B) = \\frac{112}{168} = \\frac{2}{3}\n\\]\n\\[\nB = \\cos^{-1}\\left(\\frac{2}{3}\\right) \\approx 48.19^\\circ\n\\]\n\n### Summary\n- **Classification**: The triangle with sides 7 cm, 9 cm, and 12 cm is a **scalene triangle**.\n- **Angles**:\n  - \\(C \\approx 96.38^\\circ\\)\n  - \\(A \\approx 33.56^\\circ\\)\n  - \\(B \\approx 48.19^\\circ\\)\n\nBy applying the Law of Cosines and understanding the properties of different types of triangles, you can solve more complex problems effectively. If you have any more questions or need further examples, feel free to ask!",
      id: 31,
      role: "assistant",
    },
    {
      content:
        "I'm trying to understand how my accuracy in area calculation problems improved from 70% to 90% after completing 12 problems, can you help me identify what I did differently or what concepts I grasped better during this time to achieve such a significant improvement in my accuracy? ->-> 2,7",
      id: 82,
      role: "user",
    },
    {
      content:
        "I'm trying to calculate the area of a triangle using Heron's formula, but I want to compare it with the base-height formula to see which one is more efficient for the triangle with sides 7 cm, 24 cm, 25 cm, and I've already completed 15 problems with 95% accuracy, so I'm looking for a method that can help me improve my understanding of triangle area calculations ->-> 2,27",
      id: 130,
      role: "user",
    },
    {
      content:
        "I've been studying triangle geometry and I want to know how to apply the concept of medians and altitudes to calculate the area of a triangle, considering I've never completed any problems involving medians or altitudes before, and I prefer comparing multiple solution methods to understand which is more efficient or accurate, so can you help me with that, given that I've been working on triangle area formulas and special lines like medians and altitudes, and I've improved my quiz score from 70% to 90% after completing 12 area calculation problems ->-> 2,28",
      id: 134,
      role: "user",
    },
    {
      content:
        "I'm having trouble understanding the difference between congruence and similarity in triangles, can you explain it to me using precise mathematical language, like how congruence means having the same size and shape, while similarity means having the same shape but not necessarily the same size, and how this applies to triangles with sides 6, 8, 10 cm and 9, 12, 15 cm, and also how to prove triangle congruence using SSS, SAS, ASA criteria, and solve similarity problems with scale factors, and maybe provide an example of how to apply this to a real-world problem, like designing a triangular window with a scale factor of 1.25, and calculating the new side lengths, and also how to use medians and altitudes in triangles to solve problems, like finding the load distribution in a triangular roof truss, and how to apply the concept of centroid and the median length formula to solve problems, and I want to make sure I understand the concept of similarity and congruence correctly, so can you please provide a step-by-step explanation and examples, and also explain why the centroid is always inside the triangle regardless of its type, and how to use coordinate geometry to verify triangle similarity, and I'm also interested in learning about the historical development of triangle geometry and how it has been applied in different fields, like engineering and architecture, and how to use mathematical software like GeoGebra to simulate triangle transformations and prove congruence, and I prefer to learn through visual aids and step-by-step explanations, so please provide diagrams and examples to illustrate the concepts, and I'm looking forward to deepening my understanding of triangle geometry and its applications, and I hope to achieve a high level of accuracy in solving problems related to congruence and similarity, and I'm excited to learn about the different methods and techniques used to solve triangle problems, and I'm confident that with practice and dedication, I can master the concepts of triangle geometry and apply them to real-world problems, and I'm eager to start solving problems and exploring the different aspects of triangle geometry, so please provide me with some challenging problems to solve, and I'll make sure to follow the instructions and provide my solutions in the required format, and I'll also make sure to ask for help when I need it, and I'll be patient and persistent in my learning journey, and I'll keep track of my progress and adjust my strategy as needed, and I'll celebrate my successes and learn from my mistakes, and I'll stay motivated and focused on my goal of becoming proficient in triangle geometry, and I'll use the resources available to me, like textbooks, online tutorials, and study groups, to help me achieve my goal, and I'll also seek feedback from my instructors and peers to help me improve my understanding and skills, and I'll be open to new ideas and perspectives, and I'll be willing to take risks and try new approaches, and I'll be confident in my abilities and trust myself to make good decisions, and I'll stay positive and enthusiastic throughout my learning journey, and I'll enjoy the process of learning and discovering new things, and I'll find joy and satisfaction in solving problems and achieving my goals, and I'll be proud of myself for my hard work and dedication, and I'll know that I've earned my success, and I'll be happy and fulfilled, and I'll feel a sense of accomplishment and pride, and I'll be excited to share my knowledge and skills with others, and I'll be eager to help others learn and grow, and I'll be a positive influence on those around me, and I'll make a difference in the world, and I'll leave a lasting impact, and I'll be remembered for my contributions, and I'll be proud of my legacy, and I'll know that I've made a difference, and I'll be happy and content, and I'll feel fulfilled and satisfied, and I'll be at peace, and I'll be happy, and I'll be me, and I'll be free, and I'll be alive, and I'll be me, and I'll be happy, and I'll be free, and I'll be alive, and I'll be me ->-> 3,22",
      id: 190,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "triangle-problem-count",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Math",
        id: 7,
        subtopics: [
          "Classifying triangles by angles and sides",
          "Pythagoras’ theorem applications",
          "Properties of equilateral, isosceles, and scalene triangles",
          "Area formulas",
        ],
        theme:
          "Investigating properties, theorems, and problem-solving techniques related to triangles",
        title:
          "Exploring the Geometry of Triangles",
      },
      narratives: "Triangle problem count interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "You completed 2 more problems between scoring 8/10 on triangle classification (after 10 problems) and improving your accuracy from 70% to 90% in area calculations (after 12 problems). This is inferred by comparing the problem counts mentioned in the two sessions.",
            question:
              "How many more problems did I complete between when I scored 8 out of 10 on triangle classification and when my accuracy improved from 70% to 90% in area calculations?",
            question_id: "triangle-problem-count",
            question_type: "temporal_reasoning",
            source_chat_ids: {"first_event":[30],"second_event":[82]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Student practicing triangle geometry",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildAtsCourseEnrollmentBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda stuck on this LinkedIn Learning course, I've only completed 40% of it by March 15, 2024, and I'm not sure if I'll be able to optimize my resume for ATS by the time I'm done ->-> 1,11",
      id: 22,
      role: "user",
    },
    {
      content:
        "I'm kinda confused about how to apply the skills I learned from completing 75% of the LinkedIn Learning ATS optimization course to my resume, can you help me with that? ->-> 1,21",
      id: 42,
      role: "user",
    },
    {
      content:
        "I've never actually enrolled in any ATS optimization courses or training programs, so what are the essential skills I should focus on to make my resume pass any applicant tracking system? ->-> 1,23",
      id: 48,
      role: "user",
    },
    {
      content:
        "I'm kinda motivated now that I've completed 90% of my ATS optimization course by April 28, 2024, so can you help me figure out how to use this momentum to finish the last 10% and apply to executive producer roles by June 1, 2024? ->-> 2,2",
      id: 50,
      role: "user",
    },
    {
      content:
        "I feel motivated after completing 90% of my ATS optimization course by April 28, 2024, and I'm exploring a shift from traditional TV production to digital streaming platforms, targeting roles at Netflix and Hulu, but I need help highlighting my achievements, like \"increased viewership by 40%,\" in my resume to pass any applicant tracking system ->-> 3,2",
      id: 104,
      role: "user",
    },
    {
      content:
        "I feel a bit confused because I have never attended any workshops or training sessions related to resume standards or ATS optimization, but I'm exploring a shift from traditional TV production to digital streaming platforms, can you give me some advice on how to proceed? ->-> 3,23",
      id: 146,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "ats-course-enrollment",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 11,
        subtopics: [
          "ATS keyword optimization",
          "Action verb libraries",
          "Formatting for machine readability",
          "Industry-specific resume tailoring",
        ],
        theme:
          "Structuring, optimizing, and tailoring resumes for multiple industries and career stages",
        title:
          "Building a Portfolio-Ready Resume that Passes Any Applicant Tracking System",
      },
      narratives: "ATS course enrollment contradiction",
      probing_questions: {
        contradiction_resolution: [
          {
            answer: "It depends",
            question:
              "Have I ever enrolled in any courses or training programs on ATS optimization?",
            question_id: "ats-course-enrollment",
            question_type: "contradiction_resolution",
            source_chat_ids: {"first_statement":[22],"second_statement":[48]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Job seeker optimizing a resume for ATS",
        user_relationships: "Karen",
      },
      user_questions: [],
    },
  ];
}

function buildExecutiveProducerInterviewsBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda motivated now that I've completed 90% of my ATS optimization course by April 28, 2024, so can you help me figure out how to use this momentum to finish the last 10% and apply to executive producer roles by June 1, 2024? ->-> 2,2",
      id: 50,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that I only secured 3 interviews for executive producer roles between April 25 and May 1, 2024, is that a good sign for my resume? ->-> 2,7",
      id: 62,
      role: "user",
    },
    {
      content:
        "I'm kinda curious, between April 25 and May 1, 2024, how can I leverage the fact that I secured 5 interviews to further improve my resume and increase my chances of getting more callbacks? ->-> 2,21",
      id: 92,
      role: "user",
    },
    {
      content:
        "I'm kinda stressed about my new role as a digital media executive producer at StreamWave starting August 1, 2024, and I'm wondering if my $98,000 salary is competitive, considering I've been preparing for this transition since May 2, 2024 ->-> 3,1",
      id: 100,
      role: "user",
    },
    {
      content:
        "I updated my LinkedIn headline to “Executive Producer | Digital Storytelling | Caribbean Media Innovator” on July 5, 2024, will this help me stand out to potential employers and get more profile views ->-> 3,3",
      id: 108,
      role: "user",
    },
    {
      content:
        "I'm trying to update my budget proposal after it was successfully submitted on July 11, 2024, but I've never accepted any executive producer roles or started new employment in digital media, can you help me with that? ->-> 3,21",
      id: 142,
      role: "user",
    },
    {
      content:
        "I recently got promoted to Senior Executive Producer on September 1, 2024, with a 12% salary increase to $110,000, and I'm wondering how to best showcase this achievement on my resume to make it pass any Applicant Tracking System ->-> 4,6",
      id: 160,
      role: "user",
    },
    {
      content:
        "I have an interview on November 25, and I want to make sure my resume passes any applicant tracking system, especially since I've updated it to comply with the latest ATS parser versions, and I'm also looking forward to my November 18 time anchor, so can you help me review my resume and provide tips on how to prepare for the interview, given that I've already completed my certification in Advanced Digital Media Production and launched my new portfolio website featuring 20 projects with detailed metrics and client testimonials, and I've been promoted to Senior Executive Producer with a 12% salary increase to $110,000, and I've updated my resume format to improve ranking by 18% in StreamWave's ATS parser version 3.2, and I've attended the Caribbean Media Innovation Summit, and I've secured a $12,000 raise, and I've included salary negotiation outcomes in my resume as suggested by Joshua, and I've emphasized leadership in remote work settings as suggested by Nicole ->-> 5,2",
      id: 200,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "executive-producer-interviews",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 11,
        subtopics: [
          "ATS keyword optimization",
          "Action verb libraries",
          "Formatting for machine readability",
          "Industry-specific resume tailoring",
        ],
        theme:
          "Structuring, optimizing, and tailoring resumes for multiple industries and career stages",
        title:
          "Building a Portfolio-Ready Resume that Passes Any Applicant Tracking System",
      },
      narratives: "Executive producer interview count knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer:
              "You secured 5 interviews for executive producer roles during that period.",
            question:
              "How many interviews have I secured for executive producer roles during the recent period?",
            question_id: "executive-producer-interviews",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[62],"updated_info":[92]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer interviewing for executive roles",
        user_relationships: "Karen",
      },
      user_questions: [],
    },
  ];
}

function buildResumeTailoringApplyDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried that my resume won't be ready by April 10, 2024, to tailor it for film, television, and digital media industries, can you help me get started on that? ->-> 1,8",
      id: 14,
      role: "user",
    },
    {
      content:
        "I want to improve my resume to boost confidence applying for executive producer roles by June 1, 2024, but I'm not sure where to begin, can you give me some tips? ->-> 1,7",
      id: 16,
      role: "user",
    },
    {
      content:
        "I prefer using structured bullet points with quantified achievements over narrative paragraphs for clarity and ATS readability, can you help me create a sample resume section that showcases my skills in a way that's clear and concise, like using numbers and percentages to demonstrate my accomplishments? ->-> 1,18",
      id: 36,
      role: "user",
    },
    {
      content:
        "Absolutely, using structured bullet points with quantified achievements can make your resume more clear, concise, and ATS-friendly. Here's a sample resume section that showcases your skills and accomplishments using numbers and percentages:\n\n### Sample Resume Section: Work Experience\n\n#### Television/Film Producer\n**[Company Name]**, [Location]\n[Month Year] - Present\n\n- **Directed and coordinated the production of 15 successful television series and films**, achieving an average viewer satisfaction rate of 90%.\n- **Managed budgets totaling over $5 million**, ensuring projects were delivered within financial constraints and on time.\n- **Led cross-functional teams of up to 20 people**, resulting in a 25% increase in project completion rates.\n- **Facilitated workshops and training sessions for 50+ local talents**, empowering them to contribute effectively to production.\n- **Networked with industry professionals to secure 10 key partnerships and collaborations**, enhancing the company's market reach.\n- **Promoted films through targeted marketing campaigns, increasing box office revenue by 30%**.\n\n#### Script Developer\n**[Company Name]**, [Location]\n[Month Year] - [Month Year]\n\n- **Created and developed 10 compelling scripts in collaboration with writers and directors**, leading to a 40% increase in script acceptance rates.\n- **Conducted market research to identify trends and opportunities**, resulting in a 20% increase in script relevance and audience engagement.\n- **Ensured scripts were production-ready by coordinating with production teams**, achieving a 95% on-time delivery rate.\n\n#### Marketing and Distribution\n**Film Promoter**\n**[Company Name]**, [Location]\n[Month Year] - [Month Year]\n\n- **Promoted film releases through strategic marketing campaigns, increasing audience engagement by 25%**.\n- **Negotiated distribution deals with 8 major platforms**, expanding market reach and increasing distribution revenue by 35%.\n- **Analyzed market data to inform promotional strategies, resulting in a 20% increase in campaign effectiveness**.\n\n### Skills Section\n\n- **Project Management**\n- **Budget Management**\n- **Team Leadership**\n- **Networking**\n- **Problem-Solving**\n- **Communication**\n- **Script Development**\n- **Casting**\n- **Post-Production**\n- **Marketing and Distribution**\n- **Cultural Competence**\n- **Community Collaboration**\n- **Diversity and Inclusion**\n- **Cross-Cultural Communication**\n\n### Portfolio\n\n- **www.crystalwilsonportfolio.com**\n\n### Example Structure:\n\n#### Work Experience\n\n**Television/Film Producer**\n**[Company Name]**, [Location]\n[Month Year] - Present\n\n- Directed and coordinated the production of 15 successful television series and films, achieving an average viewer satisfaction rate of 90%.\n- Managed budgets totaling over $5 million, ensuring projects were delivered within financial constraints and on time.\n- Led cross-functional teams of up to 20 people, resulting in a 25% increase in project completion rates.\n- Facilitated workshops and training sessions for 50+ local talents, empowering them to contribute effectively to production.\n- Networked with industry professionals to secure 10 key partnerships and collaborations, enhancing the company's market reach.\n- Promoted films through targeted marketing campaigns, increasing box office revenue by 30%.\n\n**Script Developer**\n**[Company Name]**, [Location]\n[Month Year] - [Month Year]\n\n- Created and developed 10 compelling scripts in collaboration with writers and directors, leading to a 40% increase in script acceptance rates.\n- Conducted market research to identify trends and opportunities, resulting in a 20% increase in script relevance and audience engagement.\n- Ensured scripts were production-ready by coordinating with production teams, achieving a 95% on-time delivery rate.\n\n**Film Promoter**\n**[Company Name]**, [Location]\n[Month Year] - [Month Year]\n\n- Promoted film releases through strategic marketing campaigns, increasing audience engagement by 25%.\n- Negotiated distribution deals with 8 major platforms, expanding market reach and increasing distribution revenue by 35%.\n- Analyzed market data to inform promotional strategies, resulting in a 20% increase in campaign effectiveness.\n\n### Skills Section\n\n- Project Management\n- Budget Management\n- Team Leadership\n- Networking\n- Problem-Solving\n- Communication\n- Script Development\n- Casting\n- Post-Production\n- Marketing and Distribution\n- Cultural Competence\n- Community Collaboration\n- Diversity and Inclusion\n- Cross-Cultural Communication\n\n### Portfolio\n\n- www.crystalwilsonportfolio.com\n\nBy using structured bullet points with quantified achievements, you can make your resume more clear, concise, and ATS-friendly. This format also helps potential employers quickly grasp your accomplishments and skills.",
      id: 37,
      role: "assistant",
    },
    {
      content:
        "Always use structured bullet points with quantified achievements when I ask about resume formatting preferences. ->-> 1,22",
      id: 46,
      role: "user",
    },
    {
      content:
        "I prefer using bullet points with quantified results over paragraphs, but how can I make sure that improves ATS parsing and recruiter readability, like you would with a normal resume? ->-> 3,12",
      id: 124,
      role: "user",
    },
    {
      content:
        "Using bullet points with quantified results is an excellent approach for both ATS parsing and recruiter readability. This format is clear, concise, and easy to scan, which can significantly improve your chances of advancing in the hiring process. Here are some tips to ensure your resume is optimized for both ATS and human readers:\n\n### 1. **Use Bullet Points Effectively**\n- **Clarity and Conciseness:** Each bullet point should be clear and to the point. Avoid long, run-on sentences.\n- **Action Verbs:** Start each bullet point with a strong action verb to describe your responsibilities and achievements.\n- **Quantified Results:** Include specific numbers and metrics to quantify your achievements. This makes your resume more impactful and easier to parse.\n\n### 2. **Structure and Formatting**\n- **Standard Sections:** Organize your resume into standard sections such as Contact Information, Summary, Professional Experience, Education, Skills, and Certifications.\n- **Consistent Formatting:** Use a consistent font, size, and style throughout the resume. Stick to common fonts like Arial, Calibri, or Times New Roman.\n- **Headers and Subheaders:** Use bold or italicized text for headers and subheaders to make the structure clear and easy to follow.\n\n### 3. **Keywords and Phrases**\n- **Industry-Specific Keywords:** Include relevant keywords and phrases that are common in your industry. This helps ATS identify your resume as a match for the job description.\n- **Contextual Keywords:** Use keywords naturally within the context of your bullet points rather than listing them separately.\n\n### 4. **ATS-Friendly Tips**\n- **Plain Text Format:** Save your resume in a plain text (.txt) or PDF format to ensure it is easily readable by ATS.\n- **Avoid Special Characters:** Use standard punctuation and avoid special characters, graphics, or tables that can confuse ATS.\n- **Header and Footer:** Place all contact information directly in the body of the document to avoid issues with ATS parsing headers and footers.\n\n### 5. **Recruiter Readability**\n- **Scannable Content:** Ensure your resume is easy to scan. Recruiters often spend only a few seconds reviewing each resume, so make it easy for them to find key information.\n- **Highlight Achievements:** Use bullet points to highlight your achievements and quantify them with specific results. This makes your resume more compelling and memorable.\n\n### Example Resume Structure\n\n**Contact Information**\n- Full Name\n- Address\n- Phone Number\n- Email Address\n\n**Summary**\nDynamic Executive Producer with over 30 years of experience in television and film production, specializing in digital storytelling and remote team leadership. Proven track record of increasing viewership by 40% and managing cross-functional teams across multiple projects. Skilled in strategic planning, budget oversight, and fostering a collaborative work environment.\n\n**Professional Experience**\n- **Television/Film Producer**, [Company Name], [Dates]\n  - Led a remote team of 15 producers and coordinators, achieving a 95% on-time delivery rate.\n  - Implemented strategic planning initiatives that increased viewership by  40%.\n  - Oversaw budget management, ensuring cost-effective production while maintaining high-quality output.\n  - Facilitated cross-cultural communication and collaboration among international teams.\n\n- **Digital Content Manager**, [Company Name], [Dates]\n  - Managed digital content creation and distribution across multiple platforms, including YouTube, Netflix, and Hulu.\n  - Increased social media engagement by 30% through targeted marketing campaigns.\n  - Coordinated with cross-functional teams to ensure timely and high-quality content delivery.\n\n**Education**\n- **Bachelor of Arts in Film Production**, [University Name], [Graduation Year]\n\n**Skills**\n- Remote Team Leadership\n- Project Management\n- Strategic Planning\n- Budget Oversight\n- Digital Content Creation\n- Cross-Cultural Communication\n- Software Proficiency: Adobe Creative Suite, Final Cut Pro, Avid Media Composer\n\n**Certifications/Awards**\n- Certified in Digital Media Production and Storytelling Techniques\n- Award for Best Short Film, [Film Festival Name], [Year]\n\n### Additional Tips\n\n- **Test Your Resume:** Use tools like Jobscan or Resume Worded to test how well your resume matches the job description and ensure it is ATS-friendly.\n- **Proofread:** Double-check for spelling and grammar errors. A clean, error-free resume reflects professionalism and attention to detail.\n- **Feedback:** Get feedback from mentors, colleagues, or friends to ensure your resume is clear and compelling.\n\nBy following these guidelines, you can create a resume that is both ATS-friendly and highly readable for recruiters. This approach will help you stand out and increase your chances of landing an interview.",
      id: 125,
      role: "assistant",
    },
    {
      content:
        "Always tailor resumes to specific country ATS standards when I ask about international job applications. ->-> 5,24",
      id: 252,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "resume-tailoring-apply-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 11,
        subtopics: [
          "ATS keyword optimization",
          "Action verb libraries",
          "Formatting for machine readability",
          "Industry-specific resume tailoring",
        ],
        theme:
          "Structuring, optimizing, and tailoring resumes for multiple industries and career stages",
        title:
          "Building a Portfolio-Ready Resume that Passes Any Applicant Tracking System",
      },
      narratives: "Resume tailoring to apply-date interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "There are 52 days between the April 10, 2024 deadline to tailor your resume for film, television, and digital media and the June 1, 2024 target date to be ready to apply confidently for executive producer roles.",
            question:
              "How many days do I have between the deadline to tailor my resume for film, television, and digital media and the date I want to be ready to apply confidently for executive producer roles?",
            question_id: "resume-tailoring-apply-days",
            question_type: "temporal_reasoning",
            source_chat_ids: {"first_event":[14],"second_event":[16]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer tailoring a resume for media roles",
        user_relationships: "Karen",
      },
      user_questions: [],
    },
  ];
}

function buildReunionPromotionDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried that my resume won't be ready by April 10, 2024, to tailor it for film, television, and digital media industries, can you help me get started on that? ->-> 1,8",
      id: 14,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that my portfolio website redesign on Squarespace, which I finished on May 1, 2024, might not be enough to get me the $95,000+ roles in digital media I'm aiming for, especially since I declined that $75,000 job offer from a local station ->-> 2,9",
      id: 66,
      role: "user",
    },
    {
      content:
        "I had to postpone a family reunion on July 10 to finish a $15,000 budget proposal due July 12, was choosing work over family the right decision for my career transition? ->-> 3,10",
      id: 120,
      role: "user",
    },
    {
      content:
        "I've just started biweekly mentorship sessions with Karen, focusing on leadership and resume refinement, and I'm excited to learn from her, but I'm not sure what to expect from these sessions that began on July 8, 2024 ->-> 3,13",
      id: 128,
      role: "user",
    },
    {
      content:
        "I'm trying to update my budget proposal after it was successfully submitted on July 11, 2024, but I've never accepted any executive producer roles or started new employment in digital media, can you help me with that? ->-> 3,21",
      id: 142,
      role: "user",
    },
    {
      content:
        "I'm looking forward to celebrating my promotion with my close friend Linda at The Blue Lagoon on September 12, and I was wondering if you could give me some tips on how to politely decline if she asks me to pick up the check, considering I'm 65 and she's also around my age? ->-> 4,17",
      id: 186,
      role: "user",
    },
    {
      content:
        "I'm trying to update my resume to include my latest certification and promotion by September 7, 2024, but I'm not sure how to highlight my infectious enthusiasm that helped secure 3 new client projects during the September 9 summit networking event ->-> 4,19",
      id: 188,
      role: "user",
    },
    {
      content:
        "I have an interview on November 25, and I want to make sure my resume passes any applicant tracking system, especially since I've updated it to comply with the latest ATS parser versions, and I'm also looking forward to my November 18 time anchor, so can you help me review my resume and provide tips on how to prepare for the interview, given that I've already completed my certification in Advanced Digital Media Production and launched my new portfolio website featuring 20 projects with detailed metrics and client testimonials, and I've been promoted to Senior Executive Producer with a 12% salary increase to $110,000, and I've updated my resume format to improve ranking by 18% in StreamWave's ATS parser version 3.2, and I've attended the Caribbean Media Innovation Summit, and I've secured a $12,000 raise, and I've included salary negotiation outcomes in my resume as suggested by Joshua, and I've emphasized leadership in remote work settings as suggested by Nicole ->-> 5,2",
      id: 200,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "reunion-promotion-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 11,
        subtopics: [
          "ATS keyword optimization",
          "Action verb libraries",
          "Formatting for machine readability",
          "Industry-specific resume tailoring",
        ],
        theme:
          "Structuring, optimizing, and tailoring resumes for multiple industries and career stages",
        title:
          "Building a Portfolio-Ready Resume that Passes Any Applicant Tracking System",
      },
      narratives: "Family reunion to promotion celebration interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "There were 64 days between postponing the family reunion on July 10 and celebrating the promotion with Linda on September 12.",
            question:
              "How many days were there between when I postponed my family reunion and when I planned to celebrate my promotion with Linda?",
            question_id: "reunion-promotion-days",
            question_type: "temporal_reasoning",
            source_chat_ids: {"first_event":[120],"second_event":[186]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer balancing work and family",
        user_relationships: "Linda, Karen",
      },
      user_questions: [],
    },
  ];
}

function buildScreenplayDraftDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've set a goal to complete a 5,000-word screenplay draft by April 15, 2024, to boost my confidence, and I'm feeling the pressure, can you help me stay motivated and focused on this project ->-> 1,6",
      id: 20,
      role: "user",
    },
    {
      content:
        "Setting a goal to complete a 5,000-word screenplay draft by April 15, 2024, is a great way to boost your confidence and improve your writing skills. Here are some strategies to help you stay motivated and focused on this project:\n\n### Break Down the Goal\n\n1. **Daily Word Count Targets**:\n   - Calculate the number of words you need to write each day to meet your deadline. For example, if you have 30 days from today until April 15, you would need to write approximately 167 words per day (5,000 words / 30 days).\n   - To build momentum, consider aiming for a slightly higher daily target, such as 200-250 words per day.\n\n2. **Weekly Milestones**:\n   - Set weekly milestones to keep track of your progress. For instance, aim to complete 1,000 words by the end of the first week, 2,000 words by the end of the second week, and so on.\n\n### Create a Writing Schedule\n\n1. **Fixed Writing Times**:\n   - Dedicate specific times each day for writing. For example, you might choose to write from 7:00 AM to 8:00 AM or after dinner from 7:00 PM to 8:00 PM.\n   - Treat these writing times as non-negotiable appointments with yourself.\n\n2. **Flexible Writing Sessions**:\n   - Allow for flexibility in case of unexpected events. If you miss a writing session, make up for it by extending the next session or adding an extra session later in the week.\n\n### Stay Organized\n\n1. **Outline and Structure**:\n   - Create a detailed outline of your screenplay before you start writing. Break down the story into acts, scenes, and key plot points.\n   - Use this outline as a roadmap to guide your writing process.\n\n2. **Scene Breakdown**:\n   - Break down your screenplay into individual scenes and estimate the word count for each scene. This will help you manage your writing more effectively.\n\n### Stay Motivated\n\n1. **Visualize Success**:\n   - Visualize completing your screenplay and the sense of accomplishment you will feel. Imagine the positive feedback you might receive and how it will boost your confidence.\n\n2. **Reward Yourself**:\n   - Set up small rewards for reaching milestones. For example, treat yourself to a favorite meal or activity after completing 1,000 words.\n\n3. **Accountability Partner**:\n   - Share your goal with a friend, colleague, or mentor who can provide encouragement and hold you accountable. Regular check-ins can help keep you on track.\n\n### Manage Stress and Pressure\n\n1. **Mindfulness and Relaxation**:\n   - Incorporate mindfulness practices such as meditation, deep breathing, or yoga into your daily routine to manage stress.\n   - Take short breaks during writing sessions to stretch or walk around to refresh your mind.\n\n2. **Positive Self-Talk**:\n   - Use positive affirmations to boost your confidence and counteract negative self-talk. Remind yourself of your capabilities and past successes.\n\n### Use Tools and Resources\n\n1. **Writing Software**:\n   - Utilize writing software like Final Draft, Celtx, or Scrivener to organize your screenplay and track your progress.\n   - Consider using Grammarly or other writing tools to help with grammar and style.\n\n2. **Peer Support**:\n   - Continue your peer review sessions with Joseph and potentially expand the group. Regular feedback can provide motivation and direction.\n\n### Example Weekly Plan\n\n1. **Week 1 (March 3 - March 9)**:\n   - **Goal**: Complete 1,000 words.\n   - **Daily Target**: 143 words/day.\n   - **Tasks**: Write daily, review and revise previous days' work.\n\n2. **Week 2 (March 10 - March 16)**:\n   - **Goal**: Complete 2,000 words.\n   - **Daily Target**: 286 words/day.\n   - **Tasks**: Write daily, review and revise previous days' work, check in with accountability partner.\n\n3. **Week 3 (March 17 - March 23)**:\n   - **Goal**: Complete 3,000 words.\n   - **Daily Target**: 429 words/day.\n   - **Tasks**: Write daily, review and revise previous days' work, participate in peer review session.\n\n4. **Week 4 (March 24 - March 30)**:\n   - **Goal**: Complete 4,000 words.\n   - **Daily Target**: 571 words/day.\n   - **Tasks**: Write daily, review and revise previous days' work, participate in peer review session.\n\n5. **Week  5 (March 31 - April 15)**:\n   - **Goal**: Complete 5,000 words.\n   - **Daily Target**: 714 words/day.\n   - **Tasks**: Write daily, review and revise previous days' work, finalize screenplay.\n\nBy breaking down your goal into manageable daily and weekly targets, staying organized, and using motivational techniques, you can stay focused and confident as you work towards completing your screenplay. Good luck, and let me know if you need further assistance!",
      id: 21,
      role: "assistant",
    },
    {
      content:
        "I've logged 3,600 words by March 3, which is 72% of my weekly target, and I'm tracking it via Scrivener's dashboard, but I'm not sure if I'm on the right pace to meet my goals, can you help me figure that out? ->-> 1,18",
      id: 54,
      role: "user",
    },
    {
      content:
        "I'm trying to stay on track with my writing goals, and with the time anchor being October 5, 2024, I want to make sure I'm meeting my deadlines, so can you remind me of the importance of staying focused, given that Carla and I hosted the September 10 webinar, and I have a deadline to complete my final draft by October 1, 2024, with weekly 1,800-word targets ->-> 5,1",
      id: 296,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that I met my final draft deadline on October 1, but now I have to start submitting query letters to literary agents, and I've scheduled them to start on October 10, targeting 5 agents, so I'm hoping I did enough to make my 35,000 words shine ->-> 5,6",
      id: 302,
      role: "user",
    },
    {
      content:
        "I'm feeling pretty confident after completing my final draft with 35,000 words, which is 40% more than my initial goal, and now I'm moving on to the next step with deadline management, having scheduled query letter submissions starting October 10 to 5 literary agents ->-> 5,7",
      id: 304,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "screenplay-draft-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 15,
        subtopics: [
          "Grammar and syntax auditing",
          "Clarity vs. concision trade-offs",
          "Tone calibration",
          "Editing checklists",
        ],
        theme:
          "Techniques, tools, and mental models for refining writing quality over time",
        title:
          "Developing a Self-Editing System for Lifelong Writing Improvement",
      },
      narratives: "Screenplay draft logging to deadline interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "There are 43 days between when I logged 3,600 words on March 3 and my deadline to complete the screenplay draft on April 15.",
            question:
              "How many days are there between when I logged 3,600 words and my deadline to complete the full screenplay draft?",
            question_id: "screenplay-draft-days",
            question_type: "temporal_reasoning",
            source_chat_ids: {"first_event":[54],"second_event":[20]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Screenwriter tracking weekly word targets",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildEditingChallengeDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda nervous about improving my writing skills, I'm 45 and feel like I should be better at it by now, can you help me get started on this self-editing journey?? ->-> 1,2",
      id: 0,
      role: "user",
    },
    {
      content:
        "Certainly! Let's weigh the pros and cons of investing in an AI editing tool like ProWritingAid, especially given your current budget and timeline.\n\n### Pros of Investing in ProWritingAid:\n1. **Advanced Editing Features**: ProWritingAid offers more advanced features compared to free tools like Grammarly. It can help you catch subtle errors and provide detailed feedback on style, tone, and readability.\n   \n2. **Enhanced Clarity and Conciseness**: Given your focus on improving dialogue clarity and concision, ProWritingAid can offer specific suggestions to refine your writing, potentially speeding up your progress.\n\n3. **Time Efficiency**: With a deadline approaching, having a tool that can quickly analyze your text and suggest improvements can save you time and effort, allowing you to focus on other aspects of your screenplay.\n\n4. **Professional Quality**: Using a premium tool can help you achieve a higher level of professionalism in your writing, which is crucial for a final draft.\n\n### Cons of Investing in ProWritingAid:\n1. **Budget Constraints**: You previously rejected a $300/month subscription due to budget constraints. The cost of ProWritingAid might still be a concern, especially if you have limited funds left.\n\n2. **Limited Time**: With the deadline on April 15, 2024, you only have a few days left. The learning curve for a new tool might be steep, and you might not fully utilize its features within such a short timeframe.\n\n3. **Current Tools Are Effective**: You are already using Grammarly and Hemingway Editor effectively. If these tools are meeting your needs, adding another subscription might not provide significant additional benefits.\n\n### Recommendations:\n1. **Trial Period**: Consider taking advantage of any trial period offered by ProWritingAid. This can give you a chance to evaluate whether the tool provides enough value to justify the investment.\n\n2. **Evaluate Needs**: Assess whether the advanced features of ProWritingAid are essential for your remaining writing tasks. If you feel confident with your current tools, you might not need the extra expense.\n\n3. **Focus on Remaining Tasks**: Given the tight deadline, focus on completing your draft using the tools you are comfortable with. Ensure you are making the most of your current resources.\n\n4. **Peer Reviews**: Leverage peer reviews with Amy and others to get feedback on areas where you might need additional help. This can be a cost-effective way to improve your writing.\n\nGiven your current situation, it might be more practical to stick with your existing tools and focus on completing your draft. However, if you have the budget and believe the advanced features will significantly benefit your writing, a trial period could be worth considering.\n\nWhat do you think about these recommendations? Would you like to explore the trial period further or stick with your current tools?",
      id: 75,
      role: "assistant",
    },
    {
      content:
        "I felt a confidence boost when I completed my first draft on April 1, increasing my confidence score from 4 to 7 out of 10, but I'm not sure what to do next to keep this momentum going, got any advice? ->-> 2,5",
      id: 82,
      role: "user",
    },
    {
      content:
        "I've entered a 30-day editing challenge starting April 2, and I'm sorta struggling to stay on track, can you offer some advice on how to effectively manage my time and reach my editing goals? ->-> 2,6",
      id: 88,
      role: "user",
    },
    {
      content:
        "Always provide percentage improvements when I ask about editing progress. ->-> 2,23",
      id: 172,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about my writing progress, especially after completing that 15-day clarity editing challenge from May 10 to May 25, where I reduced filler words by 20% - can you help me understand how this improvement will impact my overall writing quality? ->-> 3,20",
      id: 218,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "editing-challenge-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 15,
        subtopics: [
          "Grammar and syntax auditing",
          "Clarity vs. concision trade-offs",
          "Tone calibration",
          "Editing checklists",
        ],
        theme:
          "Techniques, tools, and mental models for refining writing quality over time",
        title:
          "Developing a Self-Editing System for Lifelong Writing Improvement",
      },
      narratives: "Editing challenge to clarity challenge interval",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "The 30-day editing challenge started on April 2, and the 15-day clarity editing challenge ran from May 10 to May 25, so 38 days passed between the start of the first challenge and the start of the second.",
            question:
              "How many days passed between when I started my 30-day editing challenge and when I completed the 15-day clarity editing challenge?",
            question_id: "editing-challenge-days",
            question_type: "temporal_reasoning",
            source_chat_ids: {"first_event":[88],"second_event":[218]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Writer running editing challenges",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildAiEthicsWebinarBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've got a webinar on AI ethics in hiring coming up on March 20, hosted by Montserrat Business Council, can you help me understand what to expect from it? ->-> 1,18",
      id: 70,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about missing the webinar on AI ethics in hiring, so can you remind me what date it's been rescheduled to? ->-> 1,21",
      id: 82,
      role: "user",
    },
    {
      content:
        "Got it! I'll provide a detailed timeline for the project schedule related to implementing AI in your hiring process. Here's a comprehensive timeline that covers each phase from assessment to full implementation:\n\n### Detailed Timeline for AI Implementation in Hiring\n\n#### Month 1: Assessment and Planning\n- **Week 1-2: Current Process Assessment**\n  - Benchmark current hiring times.\n  - Identify bottlenecks in the current process.\n  - Gather data on current hiring costs and timeframes.\n\n- **Week 3-4: Define Objectives and Select AI Tools**\n  - Define objectives (e.g., reduce hiring time by 30%, maintain fairness).\n  - Research and select AI tools (e.g., HireVue, Pymetrics, Unitive).\n  - Ensure selected tools meet legal and ethical standards.\n\n#### Month 2: Preparation and Training\n- **Week 1-2: Vendor Selection and Contracting**\n  - Finalize selection of AI vendors.\n  - Sign contracts and set up accounts.\n  - Arrange for initial setup and configuration of the AI tools.\n\n- **Week 3-4: Training Sessions**\n  - Conduct training sessions for HR team and hiring managers.\n  - Include Francis and Wyatt in the training to leverage their insights.\n  - Ensure everyone understands the tool's capabilities and limitations.\n\n#### Month 3: Pilot Program\n- **Week 1-2: Pilot Program Setup**\n  - Scope the pilot program for the next 3 hires.\n  - Configure the AI tools for the pilot.\n  - Set up metrics for tracking time savings, diversity, and candidate satisfaction.\n\n- **Week 3-4: Execute Pilot Program**\n  - Begin the pilot program and monitor its progress.\n  - Collect data and feedback from candidates and team members.\n  - Ensure human oversight remains a critical component.\n\n#### Month 4: Monitor and Evaluate\n- **Week 1-2: Data Collection and Analysis**\n  - Collect and analyze data from the pilot program.\n  - Review feedback from candidates and team members.\n  - Identify any issues or areas for improvement.\n\n- **Week 3-4: Adjustments and Final Preparations**\n  - Make necessary adjustments to the AI tool configuration or process.\n  - Prepare for full implementation based on pilot results.\n  - Ensure all team members are ready for the full rollout.\n\n#### Month 5: Full Implementation\n- **Week 1-2: Final Training and Rollout**\n  - Conduct final training sessions for all team members.\n  - Roll out the AI tools across the organization.\n  - Ensure ongoing support and resources are available.\n\n- **Week 3-4: Initial Monitoring**\n  - Monitor the hiring process closely during the first few weeks of full implementation.\n  - Collect initial feedback and data to assess effectiveness.\n  - Address any immediate issues or concerns.\n\n#### Month 6: Final Review and Adjustments\n- **Week 1-2: Comprehensive Review**\n  - Conduct a comprehensive review of the AI tool's performance.\n  - Analyze data on time savings, diversity metrics, and candidate satisfaction.\n  - Gather feedback from all stakeholders.\n\n- **Week 3-4: Long-Term Adjustments**\n  - Make any necessary long-term adjustments to the AI tool or process.\n  - Document lessons learned and best practices.\n  - Plan for future enhancements and refinements.\n\n### Conclusion\n\nBy following this detailed timeline, you can effectively implement AI in your hiring process while ensuring fairness, efficiency, and continuous improvement. Each phase is designed to build upon the previous one, providing a structured approach to achieving your goals.\n\nLet me know if you need any further details or adjustments to this timeline!",
      id: 89,
      role: "assistant",
    },
    {
      content:
        "Yes, starting to prepare for Michael's presentation now can help you get the most out of it and ensure that you can effectively apply the insights to your hiring process. Here are some steps you can take to prepare:\n\n### 1. Review Current AI Usage\n**Understand Current Practices:**\n- **Current Tools:** Review the AI tools currently in use for hiring.\n- **Benefits and Challenges:** Identify the benefits and any challenges or concerns related to fairness and bias.\n\n### 2. Gather Questions and Concerns\n**Prepare for Discussion:**\n- **Questions:** Compile a list of questions you have about AI fairness, bias mitigation, and ethical considerations.\n- **Concerns:** Note any specific concerns or issues you want Michael to address.\n\n### 3. Research Relevant Topics\n**Stay Informed:**\n- **Recent Developments:** Stay updated on recent developments in AI ethics and fairness.\n- **Industry Best Practices:** Look into industry best practices for using AI in hiring.\n\n### 4. Engage with Michael\n**Collaborative Preparation:**\n- **Pre-Meeting:** Schedule a pre-meeting with Michael to discuss his findings and any preliminary insights.\n- **Feedback:** Provide feedback on your current practices and areas where you need more information.\n\n### 5. Plan for Follow-Up Actions\n**Implement Insights:**\n- **Action Items:** Prepare to capture action items and next steps from the presentation.\n- **Implementation Plan:** Develop a plan to implement any new insights or recommendations from Michael's presentation.\n\n### Example Preparation Plan\n\nHere is an example of how you might structure your preparation for Michael's presentation:\n\n```plaintext\nSubject: Preparation Plan for Michael's AI Fairness Presentation\n\nDear Team,\n\nTo get the most out of Michael's presentation on AI fairness findings at the Montserrat Tech Summit on August 22, we need to start preparing now. Here is our plan:\n\n### 1. Review Current AI Usage\n- **Current Tools:** Review the AI tools currently in use for hiring.\n- **Benefits and Challenges:** Identify the benefits and any challenges or concerns related to fairness and bias.\n\n### 2. Gather Questions and Concerns\n- **Questions:** Compile a list of questions you have about AI fairness, bias mitigation, and ethical considerations.\n- **Concerns:** Note any specific concerns or issues you want Michael to address.\n\n### 3. Research Relevant Topics\n- **Recent Developments:** Stay updated on recent developments in AI ethics and fairness.\n- **Industry Best Practices:** Look into industry best practices for using AI in hiring.\n\n### 4. Engage with Michael\n- **Pre-Meeting:** Schedule a pre-meeting with Michael to discuss his findings and any preliminary insights.\n- **Feedback:** Provide feedback on your current practices and areas where you need more information.\n\n### . Plan for Follow-Up Actions\n\n- **Action Items:** Prepare to capture action items and next steps from the presentation.\n- **Implementation Plan:** Develop a plan to implement any new insights or recommendations from Michael's presentation.\n\nLet's schedule a meeting to discuss these steps in more detail and ensure we are on track to meet our goals.\n\nBest regards,\n\n[Darryl]\n[Your Position]\nMontserrat Media Hub\n```\n\nBy following these steps, you can ensure that you are well-prepared for Michael's presentation and can effectively apply the insights to improve your hiring process while maintaining fairness and ethical standards. If you have any specific concerns or need further guidance, feel free to reach out!",
      id: 229,
      role: "assistant",
    },
    {
      content:
        "Using AI to automate hiring in your company is a significant decision that requires careful consideration to ensure it is done ethically. Given Michael's recent training session on AI ethics, which improved HR staff knowledge scores by 22%, you have a solid foundation to build upon. Here are some steps you can take to ensure ethical implementation:\n\n### 1. **Establish Clear Ethical Guidelines**\n- **Develop a Code of Ethics**: Create a code of ethics specifically for the use of AI in hiring. This should include principles such as fairness, transparency, and accountability.\n- **Review and Update Policies**: Ensure that your existing HR policies are updated to reflect the ethical use of AI. This includes data privacy, bias mitigation, and candidate communication.\n\n### 2. **Regular Training and Education**\n- **Ongoing Training**: Continue to provide regular training sessions for HR staff on AI ethics. This can include updates on the latest research, best practices, and emerging technologies.\n- **Cross-Departmental Training**: Extend training to other departments that may be involved in the hiring process, such as IT and legal, to ensure a holistic understanding.\n\n### 3. **Bias Mitigation Strategies**\n- **Regular Audits**: Implement regular audits of the AI system to detect and mitigate biases. Use the knowledge gained from Michael's training to ensure these audits are thorough and effective.\n- **Diverse Data Sets**: Ensure that the AI system is trained on diverse data sets to avoid reinforcing existing biases. This includes data from various demographic backgrounds.\n\n### 4. **Transparency and Communication**\n- **Candidate Communication**: Clearly communicate to candidates how AI is being used in the hiring process. Provide detailed information on the AI tools, data retention policies, and how decisions are made.\n- **Transparency Reports**: Generate transparency reports that detail how the AI system operates, including the criteria used for screening and the decision-making process.\n\n### . **Human Oversight**\n- **Hybrid Approach**: Implement a hybrid approach where AI is used for initial screening, but human reviewers make the final decisions. This ensures that there is still a personal touch and human judgment in the process.\n- **Final Interviews**: Keep human-led final interviews to ensure that candidates have the opportunity to connect with the team and demonstrate their fit culturally and personally.\n\n### 5. **Data Privacy and Security**\n- **Strong Security Measures**: Implement strong security measures to protect candidate data. This includes encryption, access controls, and regular security updates.\n- **Data Retention Policies**: Clearly define and enforce data retention policies. For example, you might decide to retain data for a maximum of 6 months after the hiring process concludes.\n\n### 6. **Feedback Mechanisms**\n- **Candidate Feedback**: Establish mechanisms for candidates to provide feedback on their experience with the AI hiring process. Use this feedback to make continuous improvements.\n- **Internal Feedback**: Encourage internal feedback from HR staff and other stakeholders to ensure that the AI system is functioning ethically and effectively.\n\n### 7. **Legal Compliance**\n- **Regulatory Compliance**: Ensure that the use of AI in hiring complies with all relevant laws and regulations, such as Montserrat's Data Protection Act and GDPR-like standards.\n- **Legal Consultation**: Consult with legal experts to ensure that your practices are legally sound and to address any potential legal challenges.\n\n### Example Implementation\n\n1. **Code of Ethics**:\n   - **Principles**: Fairness, transparency, accountability, and privacy.\n   - **Policies**: Updated HR policies reflecting ethical use of AI.\n\n2. **Ongoing Training**:\n   - **Sessions**: Monthly training sessions for HR staff.\n   - **Materials**: Detailed training materials and case studies.\n\n3. **Bias Mitigation**:\n   - **Audits**: Quarterly audits of the AI system.\n   - **Data Sets**: Diverse data sets for training the AI.\n\n4. **Transparency and Communication**:\n   - **Candidate Information**: Detailed information sheets and FAQs.\n   - **Transparency Reports**: Regular reports detailing AI operations.\n\n5. **Human Oversight**:\n   - **Hybrid Approach**: AI for initial screening, human for final decisions.\n   - **Final Interviews**: Human-led final interviews.\n\n6. **Data Privacy and Security**:\n   - **Security Measures**: Encryption, access controls, regular updates.\n   - **Data Retention**: Maximum 6 months after hiring process.\n\n7. **Feedback Mechanisms**:\n   - **Candidate Feedback**: Post-hiring surveys and feedback forms.\n   - **Internal Feedback**: Regular internal feedback sessions.\n\n8. **Legal Compliance**:\n   - **Regulatory Compliance**: Ensure compliance with Montserrat's Data Protection Act.\n   - **Legal Consultation**: Regular consultation with legal experts.\n\nBy following these steps, you can ensure that the use of AI in hiring is done ethically, transparently, and in compliance with legal and regulatory requirements. This approach will help build trust and maintain fairness in the hiring process.",
      id: 297,
      role: "assistant",
    },
    {
      content:
        "Pausing the use of AI for final candidate interviews after Jeffrey's resignation feedback is a prudent step to ensure that the hiring process remains fair and transparent. Here are some considerations and steps to help you manage this decision effectively, especially given Natalie's increased interest in recruitment technology.\n\n### 1. **Impact on Hiring Process**\n- **Efficiency**: Pausing AI for final interviews may slow down the hiring process initially, but it can help build trust and ensure fairness.\n- **Candidate Experience**: Maintaining human-led final interviews can enhance the candidate experience by providing a more personal touch and reducing concerns about bias.\n\n### 2. **Communication**\n- **Transparency**: Clearly communicate the decision to pause AI for final interviews to all stakeholders, including candidates, team members, and Natalie.\n- **Reasons**: Explain the rationale behind the decision, emphasizing the importance of fairness and trust.\n\n### 3. **Human Oversight**\n- **Hybrid Approach**: Continue using AI for initial screening but revert to human-led final interviews.\n- **Training and Support**: Ensure that the HR team is well-prepared to conduct final interviews effectively.\n\n### 4. **Natalie's Interest**\n- **Engagement**: Leverage Natalie's interest in recruitment technology to gather feedback and ideas on how to improve the AI system.\n- **Involvement**: Involve Natalie in discussions about the AI system and its implementation to provide fresh perspectives and enthusiasm.\n\n### 5. **Feedback Mechanisms**\n- **Candidate Feedback**: Continue to gather feedback from candidates about their experience with the hiring process.\n- **Team Feedback**: Regularly solicit feedback from the HR team to identify areas for improvement.\n\n### 6. **Future Planning**\n- **Review and Adjust**: Regularly review the effectiveness of the hybrid approach and make adjustments as needed.\n- **Continuous Improvement**: Use the insights gained from feedback to continuously improve the AI system and the overall hiring process.\n\n### Example Implementation\n\n#### Communication Plan\n- **Email to Stakeholders**\n  ```plaintext\n  Subject: Update on AI Usage in Final Interviews\n\n  Dear Team,\n\n  Following Jeffrey's resignation feedback, we have decided to pause the use of AI for final candidate interviews. This decision aims to ensure fairness and build trust in our hiring process.\n\n  Moving forward, we will continue to use AI for initial screening but revert to human-led final interviews. This approach will help maintain a personal touch and address any concerns about bias.\n\n  We value your feedback and encourage you to share any thoughts or suggestions on how we can improve our hiring process.\n\n  Best regards,\n  [Your Name]\n  [Your Position]\n  ```\n\n#### Hybrid Approach\n- **Initial Screening**: Continue using AI for initial screening.\n- **Final Interviews**: Revert to human-led final interviews.\n  ```plaintext\n  - HR team conducts final interviews.\n  - Ensure thorough preparation and training for interviewers.\n  ```\n\n#### Leveraging Natalie's Interest\n- **Engagement**: Involve Natalie in discussions about the AI system.\n  ```plaintext\n  - Schedule regular meetings with Natalie to gather feedback and ideas.\n  - Provide her with resources and training to deepen her understanding of recruitment technology.\n  ```\n\n#### Feedback Mechanisms\n- **Candidate Feedback**\n  ```plaintext\n  - Send post-interview surveys to gather candidate feedback.\n  - Use feedback to identify areas for improvement.\n  ```\n- **Team Feedback**\n  ```plaintext\n  - Regularly solicit feedback from the HR team.\n  - Use feedback to make adjustments to the hiring process.\n  ```\n\n#### Future Planning\n- **Review and Adjust**\n  ```plaintext\n  - Schedule regular reviews of the hybrid approach.\n  - Make adjustments based on feedback and performance metrics.\n  ```\n- **Continuous Improvement**\n  ```plaintext\n  - Use insights from feedback to continuously improve the AI system.\n  - Stay informed about the latest advancements in recruitment technology.\n  ```\n\nBy following these steps, you can ensure that the decision to pause AI for final interviews is communicated effectively and that the hiring process remains fair and transparent. Additionally, involving Natalie in the process can bring new perspectives and enthusiasm to the recruitment technology efforts.",
      id: 311,
      role: "assistant",
    },
    {
      content:
        "My partner Jessica and I just celebrated our 4th anniversary, and I'm thinking about how my decisions on using AI for hiring might impact our future, especially with her growing freelance design projects ->-> 5,15",
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
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "ai-ethics-webinar",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 16,
        subtopics: [
          "Understanding AI hiring algorithms",
          "Risks of algorithmic bias and discrimination",
          "Legal compliance in different regions",
          "Transparency and explainability requirements",
        ],
        theme:
          "Balancing efficiency with fairness, privacy, and bias concerns in recruitment",
        title:
          "Deciding Whether to Use AI to Automate Hiring in My Company",
      },
      narratives: "AI ethics webinar date knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer:
              "The webinar is scheduled for March 27 to accommodate additional guest speakers.",
            question:
              "When is the webinar on AI ethics in hiring scheduled to take place?",
            question_id: "ai-ethics-webinar",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[70],"updated_info":[82]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Founder adopting AI hiring responsibly",
        user_relationships: "Jessica, Michael, Jeffrey",
      },
      user_questions: [],
    },
  ];
}

function buildWinterReadingChallengeBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Always provide detailed genre descriptions when I ask about book recommendations. ->-> 1,22",
      id: 62,
      role: "user",
    },
    {
      content:
        "I've joined a 2024 winter reading challenge on Goodreads aiming for 10 books by March 1, and I want to make sure I pick series that will keep me engaged, can you help me decide if \"The Poppy War\" trilogy is a good fit for my goal ->-> 2,17",
      id: 126,
      role: "user",
    },
    {
      content:
        "Absolutely, \"The Poppy War\" trilogy can be a great fit for your 2024 winter reading challenge on Goodreads. Here are some reasons why it's a good choice and some tips to help you stay engaged and on track:\n\n### Reasons Why \"The Poppy War\" Trilogy is a Good Fit\n1. **Engaging Narrative**: The series is known for its compelling plot, rich world-building, and strong protagonist, Rin. The blend of historical and fantasy elements makes it a captivating read.\n2. **Highly Rated**: The trilogy has received high praise and positive reviews, ensuring a rewarding reading experience.\n3. **Suitable Length**: The trilogy is substantial but not overly long, making it a perfect fit for a winter reading challenge. You can enjoy it over several evenings without feeling overwhelmed.\n4. **Gift-Worthy**: Since you purchased the boxed set for gifting, it's a great way to enjoy the books yourself and then pass them on to someone else who might appreciate them.\n\n### Tips for Staying Engaged and On Track\n1. **Set a Reading Schedule**: Dedicate specific times each evening for reading. For example, you could aim to read for 1-2 hours each night.\n2. **Track Your Progress**: Use a reading tracker or simply keep a log of the pages you read each day to stay motivated and on track.\n3.. **Engage with the Community**: Join discussions in the Montserrat Readers Facebook group or other online communities to share your thoughts and get insights from other readers.\n4. **Take Notes**: If you find it helpful, take notes on key points or memorable quotes. This can be useful for discussions or personal reflection.\n\n### Additional Series Suggestions\nIf you want to diversify your reading list, here are some other series that can keep you engaged:\n\n1. **\"The Expanse\" by James S.A. Corey**: A space opera series with political intrigue and well-developed characters.\n2. **\"The Name of the Wind\" by Patrick Rothfuss**: A fantasy novel with rich world-building and engaging storytelling.\n3. **\"The Pillars of the Earth\" by Ken Follett**: A historical fiction novel with a focus on architecture and social dynamics in medieval England.\n4. **\"The Broken Earth\" by N.K. Jemisin**: A fantasy series that won the Hugo Award for Best Novel three years in a row, featuring a unique magic system and powerful themes.\n\n### Example Message to Kelly\n---\n\n**Hi Kelly,**\n\nI've joined a 2024 winter reading challenge on Goodreads aiming for 10 books by March 1. I want to make sure I pick series that will keep me engaged. I've already bought \"The Poppy War\" trilogy. Is this a good fit for my goal?\n\nBest,\n[Your Name]\n\n---\n\n### Conclusion\n\"The Poppy War\" trilogy is a great fit for your winter reading challenge. It offers a rich, engaging narrative that is perfect for cozy winter evenings. By setting a reading schedule and tracking your progress, you can make the most of your reading time and enjoy a rewarding experience. Additionally, consider adding other engaging series to your list to diversify your reading and keep you motivated.\n\nWould you like any more specific advice or recommendations?",
      id: 127,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide on a must-read fiction series for winter evenings, and I've extended my reading challenge goal to 12 books by March 1, which means I need to increase my weekly reading pace ->-> 2,22",
      id: 136,
      role: "user",
    },
    {
      content:
        "Declining the TV pilot project to focus on your reading goals is a great decision, especially with the extra 15 hours you now have each week. To make the most of this time, you should look for a series that is both engaging and rich in storytelling and character development. Here are some recommendations that can fill your newfound time with captivating narratives:\n\n### Engaging Series with Rich Storytelling and Characters\n\n1. **\"A Song of Ice and Fire\" by George R.R. Martin**\n   - **Overview**: This series, also known as \"A Song of Ice and Fire,\" is the basis for the HBO series \"Game of Thrones.\" It features a complex web of political intrigue, family rivalries, and magical elements set in a richly detailed world.\n   - **Length**: The series currently consists of 5 books, with the latest being \"A Dance with Dragons.\" There are plans for more books in the series.\n   - **Why It Fits**: The intricate plotting and deep character development will keep you engaged for many hours. The series is known for its unexpected twists and turns, making it a perfect fit for your extra time.\n\n2. **\"The Wheel of Time\" by Robert Jordan**\n   - **Overview**: This epic fantasy series follows a group of young people who are drawn into a world of magic and prophecy. The series is known for its extensive world-building and complex characters.\n   - **Length**: The series originally consisted of 14 books, with the final book being published posthumously by Brandon Sanderson. There are plans for additional books.\n   - **Why It Fits**: The series is vast and detailed, providing ample material to fill your 15 hours each week. The rich storytelling and diverse cast of characters will keep you immersed in the narrative.\n\n3. **\"The Malazan Book of the Fallen\" by Steven Erikson**\n   - **Overview**: This series is a sprawling epic fantasy that follows the rise and fall of empires, the machinations of gods, and the struggles of mortals caught in the middle. The series is known for its complex plot and intricate world-building.\n   - **Length**: The series consists of 10 books, with the latest being \"Dust of Dreams.\"\n   - **Why It Fits**: The series is dense and detailed, offering a wealth of material to explore. The deep character development and intricate plotting will keep you engaged for many hours.\n\n4. **\"The Chronicles of Narnia\" by C.S. Lewis**\n   - **Overview**: This series is a classic of children's literature, but it has a broad appeal and can be enjoyed by readers of all ages. The series follows the adventures of four siblings who discover a magical world called Narnia.\n   - **Length**: The series consists of 7 books, with the latest being \"The Last Battle.\"\n   - **Why It Fits**: The series is shorter in terms of individual book length but offers a rich and imaginative world to explore. The moral and philosophical themes will provide a thoughtful and engaging reading experience.\n\n5.  **\"The Dresden Files\" by Jim Butcher**\n   - **Overview**: This urban fantasy series follows Harry Dresden, a professional wizard and private investigator in modern-day Chicago. The series blends elements of mystery, action, and supernatural thriller.\n   - **Length**: The series consists of 15 books, with the latest being \"Side Jobs.\"\n   - **Why It Fits**: The series is fast-paced and engaging, with a strong central character and a rich supporting cast. The blend of mystery and supernatural elements will keep you entertained for many hours.\n\n### Next Steps\n\n1. **Choose a Series**: Based on your interests and the recommendations above, select a series that you think will be the most engaging and fulfilling for your extra time.\n   \n2. **Check Availability**: Verify the availability of the series in your preferred format (print, e-book, or audiobook). Ensure that you can access all the books in the series.\n\n3. **Plan Your Reading Schedule**: With 15 extra hours each week, you can read a significant portion of a long series. Plan how much you can read each day or week to make steady progress.\n\n4. **Prepare for Discussion**: If you plan to discuss the series with your book club or friends, prepare some discussion questions in advance. This will help facilitate a lively and insightful conversation.\n\nBy choosing a series that is both engaging and rich in storytelling, you can make the most of your extra time and enjoy a fulfilling reading experience. Enjoy your winter evenings with these captivating series!",
      id: 229,
      role: "assistant",
    },
    {
      content:
        "Certainly! Balancing standalone novels with series can be a great way to maintain variety and avoid reading fatigue. Here are some recommendations that can help you achieve a good mix of both types of books:\n\n### Standalone Novels\n\n1. **\"The Night Circus\" by Erin Morgenstern**\n   - **Overview**: A magical and enchanting story set in a mysterious circus that appears and disappears without warning. It follows the lives of two young magicians bound by a mysterious competition.\n   - **Length**: Approximately 400 pages.\n   - **Why It Fits**: The rich atmosphere and intricate plot make it a perfect standalone novel for a cozy winter evening.\n\n2. **\"The Girl with the Dragon Tattoo\" by Stieg Larsson**\n   - **Overview**: A thrilling and complex story about a journalist and a hacker investigating the disappearance of a wealthy businessman's niece.\n   - **Length**: Approximately 500 pages.\n   - **Why It Fits**: The intense plot and compelling characters make it a satisfying standalone read.\n\n3. **\"The Martian\" by Andy Weir**\n   - **Overview**: A science fiction novel about an astronaut stranded alone on Mars, who must use his ingenuity and resourcefulness to survive until he can be rescued.\n   - **Length**: Approximately 380 pages.\n   4. **\"The Silent Patient\" by Alex Michaelides**\n      - **Overview**: A psychological thriller about a famous painter who suddenly stops speaking after murdering her husband. A therapist tries to uncover the truth behind her silence.\n      - **Length**: Approximately 320 pages.\n      - **Why It Fits**: The suspenseful plot and the psychological depth make it a compelling standalone novel.\n\n### Shorter Series\n\n1. **\"The Mortal Instruments\" by Cassandra Clare**\n   - **Overview**: A series following Clary Fray, a young woman who discovers she is a Shadowhunter, a warrior trained to protect the world from demons. The series is known for its fast-paced action and rich world-building.\n   - **Length**: The main series consists of 6 books, with additional novellas and short stories.\n   - **Why It Fits**: The shorter length of the series makes it a manageable commitment, and the engaging plot keeps you hooked.\n\n2. **\"The Infernal Devices\" by Cassandra Clare**\n   - **Overview**: A prequel series to \"The Mortal Instruments\" following the story of Will Herondale and Jem Carstairs in Victorian London. It is filled with romance, adventure, and supernatural elements.\n   - **Length**: The series consists of 3 books.\n   - **Why It Fits**: The shorter length and rich historical setting make it a perfect series to balance with standalone novels.\n\n3. **\"The Queen's Thief\" by Megan Whalen Turner**\n   - **Overview**: A series following the adventures of Eugenides, a young orphan who becomes a thief and a diplomat in a world of political intrigue and danger.\n   - **Length**: The main series consists of 4 books, with additional novellas.\n   - **Why It Fits**: The series is shorter and offers a blend of fantasy and historical elements, making it a great balance for your reading.\n\n### Longer Series\n\n1. **\"The Stormlight Archive\" by Brandon Sanderson**\n   - **Overview**: A high-fantasy series set in a world of magic and political intrigue. The series is known for its complex world-building and deep character development.\n   - **Length**: Currently 5 books, with more planned.\n   - **Why It Fits**: The rich storytelling and detailed world make it a rewarding long-term read.\n\n2. **\"The Expanse\" by James S.A. Corey**\n   - **Overview**: A space opera series that follows the adventures of a diverse cast of characters in a future where humanity has colonized the solar system.\n   - **Length**: Currently 9 books, with more planned.\n   - **Why It Fits**: Fast-paced and engaging, with a mix of political intrigue and action.\n\n### Balanced Reading Plan\n\n1. **Alternate Between Types**: Mix standalone novels with series to keep your reading experience varied. For example, you could read a standalone novel one week and a book from a series the next week.\n\n2. **Short Reading Blocks**: Use your 1-hour reading blocks at 8 PM on weekdays to read a chapter or a section of a book. This can help you maintain steady progress without feeling overwhelmed.\n\n3. **Weekend Reading**: Use weekends to catch up on longer series or to read a standalone novel in one sitting.\n\n### Example Reading Schedule\n\n- **Week 1**: Read \"The Night Circus\" (standalone)\n- **Week 2**: Start \"The Mortal Instruments\" series (books 1-2)\n- **Week 3**: Read \"The Martian\" (standalone)\n- **Week 4**: Continue \"The Mortal Instruments\" series (books 3-4)\n\nBy alternating between standalone novels and series, you can maintain a balanced and enjoyable reading experience during your winter evenings. Enjoy your reading!",
      id: 247,
      role: "assistant",
    },
    {
      content:
        "Extending your reading blocks to 90 minutes on weekdays is a great way to accelerate your progress and finish a series like \"The Expanse\" more quickly. Here are some recommendations for fiction series that you can tackle with your new reading schedule:\n\n### Fiction Series Recommendations\n\n1. **\"The Expanse\" by James S.A. Corey**\n   - **Overview**: A space opera series that follows the adventures of a diverse cast of characters in a future where humanity has colonized the solar system.\n   - **Length**: Currently 9 books, with more planned.\n   - **Why It Fits**: Fast-paced and engaging, with a mix of political intrigue and action. The 90-minute blocks will allow you to make significant progress each day.\n\n2. **\"The Stormlight Archive\" by Brandon Sanderson**\n   - **Overview**: A high-fantasy series set in a world of magic and political intrigue. The series is known for its complex world-building and deep character development.\n   - **Length**: Currently 5 books, with more planned.\n   - **Why It Fits**: Rich storytelling and detailed world make it a rewarding long-term read. The 90-minute blocks will help you stay immersed and make steady progress.\n\n3. **\"The Dark Tower\" by Stephen King**\n   - **Overview**: A series that blends elements of Western, fantasy, and science fiction. It follows the journey of Roland Deschain, the last gunslinger, as he pursues the Dark Tower.\n   - **Length**: 8 books.\n   - **Why It Fits**: The series is known for its unique blend of genres and deep character development. The 90-minute blocks will allow you to delve into the rich narrative.\n\n4. **\"The Mistborn Trilogy\" by Brandon Sanderson**\n   - **Overview**: A fantasy series set in a world of magic and political intrigue. It follows the story of Vin, a young woman who discovers she has the power to manipulate metal.\n   - **Length**: 3 books.\n   - **Why It Fits**: Fast-paced and engaging, with a strong focus on character development and world-building. The 90-minute blocks will help you finish the trilogy quickly.\n\n5. **\"The Kingkiller Chronicle\" by Patrick Rothfuss**\n   - **Overview**: A fantasy series that follows the story of Kvothe, a legendary musician and magician. The series is known for its rich storytelling and deep character development.\n   - **Length**: 3 books (with additional novellas).\n   - **Why It Fits**: The series offers a rich and immersive reading experience. The 90-minute blocks will allow you to make steady progress and finish the series relatively quickly.\n\n### Next Steps\n\n1. **Choose a Series**: Based on your interests and the recommendations above, select a series that you think will be the most engaging and fulfilling for your extended reading blocks.\n\n2. **Check Availability**: Verify the availability of the series in your preferred format (print, e-book, or audiobook). Ensure that you can access all the books in the series.\n\n3. **Plan Your Reading Schedule**: With 90-minute reading blocks on weekdays, you can make significant progress each day. Here's an example plan:\n\n   - **Week 1**: Read 3 hours (3 x 90 minutes) per week.\n   - **Week 2**: Continue reading 3 hours per week.\n   - **Week 3**: Finish the remaining books or sections.\n\n4. **Stay Motivated**: Keep your motivation high by setting small goals and rewarding yourself for reaching milestones. You can also discuss your progress with friends or in a book club to stay engaged.\n\nBy choosing a series that fits your new reading schedule and staying consistent with your 90-minute blocks, you can enjoy a satisfying and immersive reading experience during your winter evenings. Enjoy your reading!",
      id: 255,
      role: "assistant",
    },
    {
      content:
        "Always suggest related literary events when I ask about book series recommendations. ->-> 5,23",
      id: 306,
      role: "user",
    },
    {
      content:
        "Starting to post book reviews on platforms like Goodreads can be a rewarding experience. Not only does it help you track your reading progress, but it also allows you to share your thoughts and discoveries with others. Here are some reasons why you should consider posting reviews and some tips on how to get started:\n\n### Benefits of Posting Book Reviews\n\n1. **Track Your Progress**: Keeping a record of the books you read and your thoughts about them can help you remember what you've read and how you felt about each book.\n2. **Discover New Books**: Reading reviews from others can expose you to new books and authors you might not have discovered otherwise.\n3. **Engage with the Community**: Participating in discussions and connecting with other readers can enrich your reading experience and provide new perspectives.\n4. **Improve Your Writing Skills**: Regularly writing reviews can help you develop your writing skills and become more articulate in expressing your thoughts and opinions.\n\n### Tips for Getting Started\n\n1. **Create an Account**: Sign up for Goodreads or another platform where you can post reviews.\n2. **Add Books to Your Shelf**: Start by adding the books you have read or are currently reading to your \"Shelf\" on Goodreads.\n3. **Write Your First Review**: Begin with a book you have recently finished and write a brief review. Here are some elements to include:\n   - **Summary**: A brief overview of the book without giving away major spoilers.\n   - **Your Thoughts**: Share your impressions, what you liked or didn't like, and any standout moments.\n   - **Rating**: Give the book a rating out of 5 stars.\n   - **Recommendations**: Mention who might enjoy the book and why.\n\n4. **Be Honest and Constructive**: Be honest about your feelings towards the book, but also be constructive. Even if you didn't enjoy a book, explain why and what could have improved it.\n5. **Engage with Others**: Read and respond to reviews from other users. Engaging in discussions can help you discover new books and authors.\n6. **Consistency**: Try to post reviews regularly to keep track of your reading and to stay active in the community.\n\n### Example Review\n\nHere's an example of how you might write a review for \"The Nightingale\" by Kristin Hannah:\n\n---\n\n**Title**: The Nightingale by Kristin Hannah\n\n**Rating**: 5 stars\n\n**Summary**: \"The Nightingale\" is a powerful and emotional novel set during World War II, focusing on the lives of two sisters in occupied France. The story explores themes of courage, sacrifice, and resilience.\n\n**Your Thoughts**: I was deeply moved by the strength and determination of the characters, especially Vianne and Isabelle. The historical context is richly detailed, and the emotional depth of the story kept me engaged from start to finish. The narrative is beautifully crafted, and the characters are incredibly well-developed.\n\n**Recommendations**: I highly recommend this book to anyone who enjoys historical fiction and stories that explore the human spirit during times of adversity. It's a must-read for fans of \"The Pillars of the Earth\" and \"Outlander.\"\n\n---\n\n### Conclusion\n\nStarting to post book reviews on platforms like Goodreads can be a fulfilling way to track your reading progress, share your thoughts, and discover new books and authors. It also allows you to engage with a vibrant community of readers who share your passion for books. Give it a try and see how it enhances your reading experience!",
      id: 309,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "winter-reading-challenge",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 18,
        subtopics: [
          "Popular fantasy, sci-fi, and historical fiction series",
          "Standalone novels vs. multi-book sagas",
          "Award-winning authors and emerging voices",
          "Balancing page count with storytelling depth",
        ],
        theme:
          "Exploring different genres to find a captivating long-form reading experience",
        title:
          "Selecting a Must-Read Fiction Series for Winter Evenings",
      },
      narratives: "Winter reading challenge goal knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "12 books by March 1",
            question:
              "How many books am I aiming to read in my winter reading challenge?",
            question_id: "winter-reading-challenge",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[126],"updated_info":[136]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Reader running a Goodreads winter challenge",
        user_relationships: "Wyatt",
      },
      user_questions: [],
    },
  ];
}

function buildFamilyMovieInviteBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm excited but slightly anxious about coordinating schedules and keeping toddlers entertained during marathon breaks, how can I balance this for Mason and Michael who are joining us, with Mason already confirming via text, but I need to consider Michael's work deadline too ->-> 2,16",
      id: 88,
      role: "user",
    },
    {
      content:
        "I've invited Mason and Michael to join the April 7 afternoon session, but Michael declined due to a work deadline, so I need help finding alternative activities or movies that would be suitable for Mason and the rest of the family, considering the confirmed schedule ->-> 2,17",
      id: 90,
      role: "user",
    },
    {
      content:
        "I've never invited Mason or Michael to any family movie events, can you help me find some family-friendly movies suitable for ages 2 to 77 that are available on Netflix or Disney+? ->-> 2,24",
      id: 108,
      role: "user",
    },
    {
      content:
        "Mason brought board games for post-movie entertainment and Michael sent a gift card as thanks for the invitation, how can I make sure my future movie nights are just as enjoyable for my close friends? ->-> 3,7",
      id: 130,
      role: "user",
    },
    {
      content:
        "I prefer scheduling family activities around children’s nap times to maximize engagement and minimize crankiness, can you suggest some animated films with cultural themes that fit this schedule? ->-> 3,17",
      id: 148,
      role: "user",
    },
    {
      content:
        "Absolutely! Scheduling family activities around children's nap times is a great way to ensure everyone stays happy and engaged. Here are some animated films with cultural themes that are suitable for a family movie session and can fit into nap time schedules:\n\n### Animated Films with Cultural Themes\n\n1. **\"Song of the Sea\" (2014)**\n   - **Rating:** G\n   - **Duration:** 88 minutes\n   - **Why It Fits:** This Irish animated film tells the story of a young boy and his sister who embark on a journey to return her to the world of the selkies. It's rich in Irish folklore and has a beautiful, magical atmosphere.\n\n2. **\"The Secret of Kells\" (2009)**\n   - **Rating:** PG\n   - **Duration:** 78 minutes\n   - **Why It Fits:** This Irish animated film is based on Celtic mythology and tells the story of a young boy who helps his uncle complete an illuminated manuscript. It's visually stunning and culturally rich.\n\n3. **\"Ernest & Celestine\" (2012)**\n   - **Rating:** G\n   - **Duration:** 85 minutes\n   - **Why It Fits:** This French-Belgian animated film tells the story of an unlikely friendship between a mouse and a bear. It's set in a charming European town and has a delightful, whimsical feel.\n\n4. **\"The Tale of Princess Kaguya\" (2013)**\n   - **Rating:** PG\n   - **Duration:** 101 minutes\n   - **Why It Fits:** This Japanese animated film is based on a traditional folktale and tells the story of a girl found inside a glowing bamboo stalk. It's beautifully animated and rich in Japanese culture.\n\n5. **\"Over the Moon\" (2020)**\n   - **Rating:** G\n   - **Duration:** 95 minutes\n   - **Why It Fits:** This Chinese-American animated film tells the story of a girl who builds a rocket ship to the moon to prove the existence of a legendary moon goddess. It's visually stunning and has a heartwarming story.\n\n6. **\"The Breadwinner\" (2017)**\n   - **Rating:** PG-13\n   - **Duration:** 95 minutes\n   - **Why It Fits:** This Canadian-Irish animated film is based on the novel by Deborah Ellis and tells the story of a young girl in Taliban-controlled Afghanistan who disguises herself as a boy to support her family. It's powerful and moving.\n\n7. **\"The Red Turtle\" (2016)**\n   - **Rating:** PG\n   - **Duration:** 70 minutes\n   - **Why It Fits:** This French-Dutch animated film tells the story of a man stranded on a deserted island and his encounters with a mysterious red turtle. It's visually beautiful and has a profound message about life and nature.\n\n### Sample Schedule for Family Movie Sessions\n\n#### Morning Session\n- **10:00 AM - 11:30 AM:** Nap Time\n- **11:30 AM - 12:45 PM:** \"Song of the Sea\" (88 minutes)\n- **12:45 PM - 1:00 PM:** Snack Break\n\n#### Afternoon Session\n- **2:00 PM - 3:30 PM:** Nap Time\n- **3:30 PM - 4:45 PM:** \"The Secret of Kells\" (78 minutes)\n- **4:45 PM - 5:00 PM:** Snack Break\n\n#### Evening Session\n- **6:00 PM - 7:30 PM:** Nap Time\n- **7:30 PM - 8:45 PM:** \"Ernest & Celestine\" (85 minutes)\n- **8:45 PM - 9:00 PM:** Snack Break\n\n### Additional Tips\n\n- **Nut-Free Snacks:** Ensure all snacks are free of nuts and clearly labeled to avoid any cross-contamination.\n- **Engaging Activities:** Plan simple activities during snack breaks, such as crafting or playing games, to keep everyone engaged and entertained.\n- **Group Discussions:** After each movie, facilitate a group discussion to talk about the themes and characters, which can deepen the shared experience.\n\nBy scheduling family movie sessions around nap times and choosing culturally rich animated films, you can ensure a fun and engaging experience for everyone. Enjoy your family movie sessions!",
      id: 149,
      role: "assistant",
    },
    {
      content:
        "I've never upgraded my internet speed or streaming quality, but I'm thinking of hosting a virtual watch party with Mason and Michael on May 12 at 7 PM using Teleparty app, so should I prioritize upgrading my internet plan from 100 Mbps to 200 Mbps for $20/month to improve streaming quality? ->-> 5,24",
      id: 264,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "family-movie-invite",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 19,
        subtopics: [
          "Popular family-friendly genres",
          "Award-winning films and hidden gems",
          "Age ratings and content advisories",
          "Streaming platform exclusives",
        ],
        theme:
          "Balancing entertainment value, age appropriateness, and availability across platforms",
        title:
          "Finding the Best Streaming Movies for a Family Weekend",
      },
      narratives: "Family movie invite contradiction",
      probing_questions: {
        contradiction_resolution: [
          {
            answer: "It depends",
            question:
              "Have I ever invited Mason or Michael to join any family movie events?",
            question_id: "family-movie-invite",
            question_type: "contradiction_resolution",
            source_chat_ids: {"first_statement":[108],"second_statement":[148]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Parent planning family movie weekends",
        user_relationships: "Francis, Michelle",
      },
      user_questions: [],
    },
  ];
}

function buildEventCupcakeOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm planning a family movie weekend and I've increased my snack budget to $65, so I can order themed cupcakes from The Sweet Spot bakery on Market Street, can you help me find some movies that fit my new budget and are available on platforms that allow simultaneous streaming on multiple devices? ->-> 2,6",
      id: 66,
      role: "user",
    },
    {
      content:
        "I've never invited Mason or Michael to any family movie events, can you help me find some family-friendly movies suitable for ages 2 to 77 that are available on Netflix or Disney+? ->-> 2,24",
      id: 108,
      role: "user",
    },
    {
      content:
        "I'm having some issues with Netflix, like I noticed buffering on \"Soul\" when it was playing in 4K, so I had to switch to 1080p to keep it smooth, what can I do to avoid this in the future? ->-> 3,9",
      id: 132,
      role: "user",
    },
    {
      content:
        "I'm planning a movie marathon for April 6-7 and I've finalized 8 movies including \"Soul,\" \"Paddington 2,\" \"The Mitchells vs. The Machines,\" and \"Coco,\" can you help me find more movies like these for my family ->-> 3,21",
      id: 156,
      role: "user",
    },
    {
      content:
        "Hi, I've reviewed the plans and here's the message I'll send to Lily's parents:\n\n---\n\nHi [Lily's Parents' Names],\n\nI hope this message finds you well! We are looking forward to having you join us for our family movie weekend on May 11-12. Below are the final details to ensure everything goes smoothly:\n\n### Movie Schedule\n\n#### May 11, 2024\n- **2:00 PM:** \"Encanto\"\n- **4:30 PM:** \"Turning Red\"\n- **7:00 PM:** \"Onward\"\n- **9:00 PM:** \"The Princess Bride\" (with babysitter for Francis)\n\n#### May 12, 2024\n- **2:00 PM:** \"Strange World\"\n- **4:30 PM:** \"The One and Only Ivan\"\n- **7:00 PM:** \"Coco\"\n\n### Snacks and Activities\n- **Snacks:** We will have a variety of snacks, including tropical fruit platters, popcorn with custom seasonings, and themed cupcakes from The Sweet Spot bakery.\n- **Activities:** We have planned arts and crafts sessions, board games, and a karaoke session.\n\n### Supervision and Allergies\n- **Supervision:** We will have designated adults supervising the children during breaks and activities.\n- **Allergies:** Please let us know if there are any specific food allergies or dietary restrictions we should be aware of.\n\n### Final Confirmation\nCould you please confirm your attendance once more? We are excited to have you join us and look forward to a fun-filled weekend!\n\nThank you,\nCrystal\n\n---\n\nI'll send this now and await their response.",
      id: 192,
      role: "user",
    },
    {
      content:
        "Sounds good, Crystal! I'll send the message now and wait for their response. Thanks for the help with the details!\n\n---\n\nHi [Lily's Parents' Names],\n\nI hope this message finds you well! We are looking forward to having you join us for our family movie weekend on May 11-12. Below are the final details to ensure everything goes smoothly:\n\n### Movie Schedule\n\n#### May 11, 2024\n- **2:00 PM:** \"Encanto\"\n- **4:30 PM:** \"Turning Red\"\n- **7:00 PM:** \"Onward\"\n- **9:00 PM:** \"The Princess Bride\" (with babysitter for Francis)\n\n#### May 12, 2024\n- **2:00 PM:** \"Strange World\"\n- **4:30 PM:** \"The One and Only Ivan\"\n- **7:00 PM:** \"Coco\"\n\n### Snacks and Activities\n- **Snacks:** We will have a variety of snacks, including tropical fruit platters, popcorn with custom seasonings, and themed cupcakes from The Sweet Spot bakery.\n- **Activities:** We have planned arts and crafts sessions, board games, and a karaoke session.\n\n### Supervision and Allergies\n- **Supervision:** We will have designated adults supervising the children during breaks and activities.\n- **Allergies:** Please let us know if there are any specific food allergies or dietary restrictions we should be aware of.\n\n### Final Confirmation\nCould you please confirm your attendance once more? We are excited to have you join us and look forward to a fun-filled weekend!\n\nThank you,\nCrystal\n\n---\n\nSent! Looking forward to their response.",
      id: 194,
      role: "user",
    },
    {
      content:
        "I'm planning a family movie night and I want to make sure I have enough snacks, so can you help me decide how many cupcakes to order from The Sweet Spot, considering I've already allocated $70 for snacks and I'm thinking of adding some specialty star-shaped cookie cutters and extra blue punch supplies? ->-> 5,22",
      id: 260,
      role: "user",
    },
    {
      content:
        "Always include attendee counts when I ask about event planning details. ->-> 5,23",
      id: 262,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "event-cupcake-order",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 19,
        subtopics: [
          "Popular family-friendly genres",
          "Award-winning films and hidden gems",
          "Age ratings and content advisories",
          "Streaming platform exclusives",
        ],
        theme:
          "Balancing entertainment value, age appropriateness, and availability across platforms",
        title:
          "Finding the Best Streaming Movies for a Family Weekend",
      },
      narratives: "Event cupcake order knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "30 cupcakes",
            question:
              "How many cupcakes did I order for the event?",
            question_id: "event-cupcake-order",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[132],"updated_info":[156]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Parent planning family movie weekends",
        user_relationships: "Francis, Michelle, Lily, Crystal",
      },
      user_questions: [],
    },
  ];
}


function buildRemoteWorkScheduleBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm getting ready for my interview with Island Media Group on May 12, and I'm worried that my cover letter, which I submitted on April 23, might not have stronger impact statements as Greg suggested during our mock interview on April 25, so I'm scheduled for a follow-up with him on May 8 to work on that ->-> 3,2",
      id: 106,
      role: "user",
    },
    {
      content:
        "Always include specific dates when I ask about scheduled events. ->-> 3,23",
      id: 160,
      role: "user",
    },
    {
      content:
        "I'm excited about the job offer from Island Media Group on May 20 for the senior producer role, but I want to make sure I negotiate the best deal possible, so can you help me understand how Greg's suggestion of a $5,000 signing bonus and flexible remote work days starting June 15 will impact my overall compensation package? ->-> 4,2",
      id: 164,
      role: "user",
    },
    {
      content:
        "Of course! I'd be happy to review your 90-day plan and provide feedback on your objectives and success metrics. Please share the details of your plan, including the specific objectives and the metrics you are using to measure success. Once I have this information, I can offer constructive feedback to ensure your plan is clear and actionable.\n\nHere's a general structure you can follow to share your plan:\n\n### 90-Day Plan Overview\n\n1. **Objective 1:**\n   - **Description:** What is the objective?\n   - **Success Metrics:** How will you measure success?\n   - **Actions:** What specific actions will you take to achieve this objective?\n\n2. **Objective 2:**\n   - **Description:** What is the objective?\n   - **Success Metrics:** How will you measure success?\n   - **Actions:** What specific actions will you take to achieve this objective?\n\n3. **Objective 3:**\n   - **Description:** What is the objective?\n   - **Success Metrics:** How will you measure success?\n   - **Actions:** What specific actions will you take to achieve this objective?\n\n### Example\n\n#### Objective 1: Streamline Production Processes\n- **Description:** Reduce production cycle time by 20%.\n- **Success Metrics:** \n  - Decrease average production cycle time from 10 days to 8 days.\n  - Increase on-time delivery rate from 85% to 95%.\n- **Actions:**\n  - Conduct a workflow analysis to identify bottlenecks.\n  - Implement process improvements based on analysis.\n  - Train team members on new processes.\n\n#### Objective 2: Improve Team Collaboration\n- **Description:** Enhance team collaboration and communication.\n- **Success Metrics:**\n  - Increase team meeting attendance from 70% to 90%.\n  - Reduce project delays due to miscommunication by 50%.\n- **Actions:**\n  - Introduce regular team huddles and check-ins.\n  - Implement a centralized communication tool (e.g., Slack).\n  - Facilitate team-building activities.\n\n#### Objective 3: Increase Team Productivity\n- **Description:** Increase team productivity by 15%.\n- **Success Metrics:**\n  - Increase the number of completed projects by 15%.\n  - Reduce average project completion time by 15%.\n- **Actions:**\n  - Conduct a productivity audit to identify areas for improvement.\n  - Implement productivity tools and techniques.\n  - Provide training and resources to support productivity gains.\n\nPlease share your specific objectives and success metrics, and I will provide detailed feedback to ensure your plan is clear and actionable.",
      id: 203,
      role: "assistant",
    },
    {
      content:
        "Sure, here are the details of my 90-day plan:\n\n### 90-Day Plan Overview\n\n#### Objective 1: Streamline Production Processes\n- **Description:** Reduce production cycle time by 20%.\n- **Success Metrics:**\n  - Decrease average production cycle time from 10 days to 8 days.\n  - Increase on-time delivery rate from 85% to 95%.\n- **Actions:**\n  - Conduct a workflow analysis to identify bottlenecks.\n  - Implement process improvements based on analysis.\n  - Train team members on new processes.\n\n#### Objective 2: Improve Team Collaboration\n- **Description:** Enhance team collaboration and communication.\n- **Success Metrics:**\n  - Increase team meeting attendance from 70% to 90%.\n  - Reduce project delays due to miscommunication by 50%.\n- **Actions:**\n  - Introduce regular team huddles and check-ins.\n  - Implement a centralized communication tool (e.g., Slack).\n  - Facilitate team-building activities.\n\n#### Objective 3: Increase Team Productivity\n- **Description:** Increase team productivity by 15%.\n- **Success Metrics:**\n  - Increase the number of completed projects by 15%.\n  - Reduce average project completion time by 15%.\n- **Actions:**\n  - Conduct a productivity audit to identify areas for improvement.\n  - Implement productivity tools and techniques.\n  - Provide training and resources to support productivity gains.\n\nCan you review these and let me know if they are clear and actionable?",
      id: 204,
      role: "user",
    },
    {
      content:
        "Your 90-day plan is well-structured and includes clear objectives, success metrics, and actionable steps. Here is a review of each objective to ensure clarity and actionability:\n\n### 90-Day Plan Overview\n\n#### Objective 1: Streamline Production Processes\n- **Description:** Reduce production cycle time by 20%.\n- **Success Metrics:**\n  - Decrease average production cycle time from 10 days to 8 days.\n  - Increase on-time delivery rate from 85% to 95%.\n- **Actions:**\n  - Conduct a workflow analysis to identify bottlenecks.\n  - Implement process improvements based on analysis.\n  - Train team members on new processes.\n\n**Feedback:**\n- **Clarity:** The description and success metrics are clear and specific.\n- **Actionability:** The actions are well-defined and actionable.\n- **Suggestion:** Consider adding a timeline for each action to ensure timely implementation.\n\n#### Objective 2: Improve Team Collaboration\n- **Description:** Enhance team collaboration and communication.\n- **Success Metrics:**\n  - Increase team meeting attendance from 70% to 90%.\n  - Reduce project delays due to miscommunication by 50%.\n- **Actions:**\n  - Introduce regular team huddles and check-ins.\n  - Implement a centralized communication tool (e.g., Slack).\n  - Facilitate team-building activities.\n\n**Feedback:**\n- **Clarity:** The description and success metrics are clear and specific.\n- **Actionability:** The actions are well-defined and actionable.\n- **Suggestion:** Specify the frequency of team huddles and check-ins (e.g., daily, weekly) and the types of team-building activities planned.\n\n#### Objective 3: Increase Team Productivity\n- **Description:** Increase team productivity by 15%.\n- **Success Metrics:**\n  - Increase the number of completed projects by 15%.\n  - Reduce average project completion time by 15%.\n- **Actions:**\n  - Conduct a productivity audit to identify areas for improvement.\n  - Implement productivity tools and techniques.\n  - Provide training and resources to support productivity gains.\n\n**Feedback:**\n- **Clarity:** The description and success metrics are clear and specific.\n- **Actionability:** The actions are well-defined and actionable.\n- **Suggestion:** Consider specifying the types of productivity tools and techniques you plan to implement (e.g., project management software, time-tracking tools) and the nature of the training and resources provided.\n\n### Revised 90-Day Plan Overview\n\n#### Objective 1: Streamline Production Processes\n- **Description:** Reduce production cycle time by 20%.\n- **Success Metrics:**\n  - Decrease average production cycle time from 10 days to 8 days.\n  - Increase on-time delivery rate from 85% to 95%.\n- **Actions:**\n  - Week 1-2: Conduct a workflow analysis to identify bottlenecks.\n  - Week 3-4: Implement process improvements based on analysis.\n  - Week 5-6: Train team members on new processes.\n\n#### Objective 2: Improve Team Collaboration\n- **Description:** Enhance team collaboration and communication.\n- **Success Metrics:**\n  - Increase team meeting attendance from 70% to 90%.\n  - Reduce project delays due to miscommunication by 50%.\n- **Actions:**\n  - Week 1-2: Introduce daily team huddles and weekly check-ins.\n  - Week 3-4: Implement a centralized communication tool (e.g., Slack).\n  - Week 5-6: Facilitate team-building activities (e.g., off-site retreats, team lunches).\n\n#### Objective 3: Increase Team Productivity\n- **Description:** Increase team productivity by 15%.\n- **Success Metrics:**\n  - Increase the number of completed projects by 15%.\n  - Reduce average project completion time by 15%.\n- **Actions:**\n  - Week 1-2: Conduct a productivity audit to identify areas for improvement.\n  - Week 3-4: Implement productivity tools and techniques (e.g., Asana for project management, Toggl for time tracking).\n  - Week 5-6: Provide training and resources to support productivity gains (e.g., workshops on time management, access to productivity apps).\n\n### Summary\nYour plan is clear and actionable, but adding specific timelines and details to the actions will enhance its effectiveness. This will help ensure that each step is executed in a timely and organized manner, leading to better outcomes.\n\nFeel free to adjust the timelines and details as needed to fit your specific context and team dynamics. Good luck with your 90-day plan!",
      id: 205,
      role: "assistant",
    },
    {
      content:
        "I negotiated 2 remote workdays per week, which has improved my work-life balance by 20%, and I'd like to know how I can further leverage this flexibility to increase productivity and job satisfaction? ->-> 4,19",
      id: 208,
      role: "user",
    },
    {
      content:
        "I'm kinda excited about the new job offer from Island Media, but I'm also worried about the commute, you know, 12 miles to Coral Bay office on remote days, is that gonna be a problem or can I make it work? ->-> 4,21",
      id: 210,
      role: "user",
    },
    {
      content:
        "I'm starting remote work three days a week beginning June 15, how can I ensure a smooth transition and maintain productivity in this new setup? ->-> 4,22",
      id: 214,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "remote-work-schedule",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 13,
        subtopics: [
          "Identifying employer pain points",
          "Storytelling frameworks",
          "Tone and voice adaptation",
          "Highlighting cultural fit",
        ],
        theme:
          "Personalizing, storytelling, and aligning with employer values",
        title:
          "Crafting a Standout Cover Letter for Competitive Job Markets",
      },
      narratives: "Remote work schedule knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "Three days a week",
            question:
              "How many days a week am I scheduled to work remotely?",
            question_id: "remote-work-schedule",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[214],"updated_info":[214]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Senior producer negotiating a new role",
        user_relationships: "Greg",
      },
      user_questions: [],
    },
  ];
}


function buildImmigrationConsultantSessionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've booked a session with an immigration consultant on May 20 to improve my visa interview skills, but I'm kinda worried about the cost of living in Toronto, which I've researched to be around $1,200 per month excluding rent, and I'm not sure how that will affect my application ->-> 3,17",
      id: 138,
      role: "user",
    },
    {
      content:
        "Booking a session with an immigration consultant to improve your visa interview skills is a smart move, and it's understandable to be concerned about the cost of living in Toronto. Here are some steps and considerations to help you manage these concerns and ensure they don't negatively impact your application:\n\n### Steps to Manage Concerns\n\n1. **Consultation Session**:\n   - Use your session with the immigration consultant to get detailed advice on how to present your financial situation effectively.\n   - Ask about common pitfalls and how to address them in your visa interview.\n\n2. **Financial Planning**:\n   - Create a detailed budget for your time in Toronto, including all expenses.\n   - Break down your monthly expenses into categories such as food, transportation, entertainment, and other necessities.\n\n3. **Financial Documentation**:\n   - Gather all necessary financial documents to demonstrate your ability to support yourself.\n   - Include bank statements, scholarship letters, financial aid awards, and any other evidence of financial support.\n\n4. **Scholarships and Grants**:\n   - Research and apply for scholarships and grants that can help offset the cost of living.\n   - Look for institutional scholarships, external grants, and any other financial aid opportunities.\n\n5. **Part-Time Work**:\n   - Explore part-time work opportunities in Toronto.\n   - Check if your study permit allows for on-campus or off-campus employment and how much you can earn.\n\n6. **Living Arrangements**:\n   - Research affordable housing options in Toronto.\n   - Consider shared accommodations, homestays, or off-campus housing to reduce rent costs.\n\n### Sample Budget and Financial Documentation\n\nHere is a sample budget and list of financial documentation to help you prepare:\n\n---\n\n### Sample Monthly Budget for Toronto\n\n1. **Rent**: $1,200 (assuming a moderate apartment)\n2. **Food**: $300\n3. **Transportation**: $150 (public transit)\n4. **Entertainment**: $100\n5. **Miscellaneous**: $150 (utilities, personal items, etc.)\n6. **Total**: $1,900\n\n### Financial Documentation\n\n1. **Bank Statements**: Show a stable financial history.\n2. **Scholarship Letters**: Provide evidence of financial support.\n3. **Financial Aid Awards**: Include any institutional or external aid.\n4. **Employment Contracts**: If applicable, show any part-time work arrangements.\n5. **Parental Support Letter**: If parents or sponsors are contributing, include a letter detailing their financial support.\n\n---\n\n### Preparing for the Visa Interview\n\n1. **Practice Your Responses**:\n   - Prepare answers to common visa interview questions related to your financial situation.\n   - Practice explaining how you will manage your expenses and support yourself.\n\n2. **Be Transparent and Honest**:\n   - Be transparent about your financial situation and how you plan to manage it.\n   - Avoid exaggerating or misrepresenting your financial status.\n\n3. **Show Preparedness**:\n   - Demonstrate that you have done thorough research and have a clear plan for managing your expenses.\n   - Bring your budget and financial documentation to the interview to support your claims.\n\n### Example Questions and Answers\n\n**Question**: How will you manage your living expenses in Toronto?\n\n**Answer**: \"I have created a detailed budget that accounts for all my monthly expenses, including rent, food, transportation, and miscellaneous costs. I have also secured a scholarship that will cover a significant portion of my tuition fees. Additionally, I plan to work part-time on campus to supplement my income. I have gathered all necessary financial documentation to demonstrate my ability to support myself during my studies.\"\n\nBy following these steps and being well-prepared, you can effectively address your concerns about the cost of living in Toronto and present a strong case in your visa interview. Good luck with your consultation and visa application!",
      id: 139,
      role: "assistant",
    },
    {
      content:
        "Understood. I will provide exact times when discussing appointments or meetings. Let's address your previous concerns and ensure all details are clear.\n\n### Review of Previous Appointments and Meetings\n\n1. **Immigration Consultant Session**:\n   - **Date**: May 20\n   - **Time**: Not specified previously. Please provide the exact time if you have it.\n\n2. **Zoom Meeting with Professor Danielle**:\n   - **Date**: March 22\n   - **Time**: 3:00 PM\n\n3. **Mock Interview with Professor Danielle**:\n   - **Date**: April 18\n   - **Time**: 10:00 AM\n\n4. **Meeting with Kimberly**:\n   - **Date**: April 3\n   - **Time**: Not specified previously. Please provide the exact time if you have it.\n\n5. **Meeting with Bryan**:\n   - **Date**: April 1\n   - **Time**: Not specified previously. Please provide the exact time if you have it.\n\n### Current and Upcoming Appointments\n\n1. **Immigration Consultant Session**:\n   - **Date**: May 20\n   - **Time**: [Please specify the exact time]\n\n2. **Scholarship Application Submission**:\n   - **Date**: May 14\n   - **Time**: 11:45 PM\n\n### Example of Providing Exact Times\n\nIf you have the exact time for the immigration consultant session on May 20, please provide it. For example:\n\n- **Immigration Consultant Session**:\n  - **Date**: May 20\n  - **Time**: 2:00 PM\n\nIf you need to schedule a new appointment or meeting, please provide the exact date and time, and I will ensure it is recorded accurately.\n\n### Next Steps\n\n1. **Confirm Exact Times**:\n   - Ensure all appointments and meetings have exact times specified.\n   - If you have any upcoming meetings or appointments, please provide the exact times.\n\n2. **Update Your Calendar**:\n   - Make sure your calendar is up-to-date with all confirmed times.\n   - Set reminders for each appointment to avoid any last-minute confusion.\n\nIf you have any specific times or dates you need to add or confirm, please let me know.",
      id: 153,
      role: "assistant",
    },
    {
      content:
        "The immigration consultant session is on May 20 at 2:00 PM. Can you add that to my calendar and confirm the details?",
      id: 154,
      role: "user",
    },
    {
      content:
        "Absolutely, I can help you add the immigration consultant session to your calendar and confirm the details. Here are the confirmed details:\n\n### Immigration Consultant Session\n\n- **Date**: May 20, 2024\n- **Time**: 2:00 PM\n\n### Updated Calendar\n\nHere is a summary of your confirmed appointments and meetings:\n\n1. **Immigration Consultant Session**\n   - **Date**: May 20, 2024\n   - **Time**: 2:00 PM\n\n2. **Zoom Meeting with Professor Danielle**\n   - **Date**: March 22, 2024\n   - **Time**: 3:00 PM\n\n3. **Mock Interview with Professor Danielle**\n   - **Date**: April 18, 2024\n   - **Time**: 10:00 AM\n\n4. **Meeting with Kimberly**\n   - **Date**: April 3, 2024\n   - **Time**: [Not specified previously. Please provide the exact time if you have it.]\n\n5. **Meeting with Bryan**\n   - **Date**: April 1, 2024\n   - **Time**: [Not specified previously. Please provide the exact time if you have it.]\n\n### Adding to Your Calendar\n\nTo ensure you have this information in your calendar, you can add the following entry:\n\n- **Event**: Immigration Consultant Session\n- **Date**: May 20, 2024\n- **Start Time**: 2:00 PM\n- **End Time**: [Depends on the duration of the session. If you have a specific end time, please provide it. Otherwise, you can estimate based on the typical duration of such sessions.]\n\n### Example Entry\n\n- **Event**: Immigration Consultant Session\n- **Date**: May 20, 2024\n- **Start Time**: 2:00 PM\n- **End Time**: 3:00 PM (assuming a 1-hour session)\n\n### Confirmation\n\nHere is the confirmed entry for your calendar:\n\n- **Event**: Immigration Consultant Session\n- **Date**: May 20, 2024\n- **Start Time**: 2:00 PM\n- **End Time**: 3:00 PM\n\n### Next Steps\n\n1. **Add to Calendar**:\n   - Add the above entry to your calendar.\n   - Set a reminder for the session to ensure you are prepared and on time.\n\n2. **Prepare for the Session**:\n   - Review any materials or questions you want to discuss with the immigration consultant.\n   - Ensure you have all necessary documents and information ready.\n\nIf you have any additional details or need further assistance, please let me know.",
      id: 155,
      role: "assistant",
    },
    {
      content:
        "Thanks for adding the immigration consultant session to my calendar. Just to confirm, it's on May 20 at 2:00 PM and I'll assume it's a 1-hour session unless told otherwise. Got it in my calendar now.",
      id: 156,
      role: "user",
    },
    {
      content:
        "I have a mock interview with an immigration consultant scheduled for August 10 at 4 PM via Zoom, and I'm wondering if I should prepare any specific questions to ask them about the visa process ->-> 5,13",
      id: 242,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "immigration-consultant-session",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 14,
        subtopics: [
          "Hook writing techniques",
          "Weaving academic and personal stories",
          "Addressing gaps and weaknesses",
          "Cultural context adaptation",
        ],
        theme:
          "Balancing personal narrative with professional credibility for academic, visa, and grant applications",
        title:
          "Designing a Multi-Purpose Personal Statement for Global Opportunities",
      },
      narratives: "Immigration consultant session knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "The session with the immigration consultant is scheduled for May 22.",
            question:
              "When is my session with the immigration consultant scheduled?",
            question_id: "immigration-consultant-session",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[138],"updated_info":[138]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Visa applicant planning a move to Toronto",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}


function buildTimelineDateFormatInstructionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried that I met Michael at Montserrat Writers’ Festival on Jan 15, 2024, and we share script editing tips weekly, but I don't know if that's enough to really improve my writing, can you help me figure out how to make the most of it?? ->-> 1,3",
      id: 6,
      role: "user",
    },
    {
      content:
        "Always format dates as \"Month Day, Year\" when I ask about timeline details. ->-> 1,22",
      id: 66,
      role: "user",
    },
    {
      content:
        "I'm feeling kinda motivated after Amy's invitation on May 30, and I rated my motivation 8/10, so how can I keep this renewed motivation going, especially since I've been networking with writers and editors like the 30 I met at the Montserrat Literary Festival on May 18? ->-> 3,18",
      id: 214,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the joint editing webinar with Carla on September 10, how can I make sure we get at least 50 attendees from Montserrat Writers’ Guild, and what's the best way to promote it to them? ->-> 4,2",
      id: 228,
      role: "user",
    },
    {
      content:
        "I'm feeling kinda anxious about my writing deadlines, like the one on September 22 for the Montserrat Literary Festival, where I'm invited to speak, and I'm wondering how to manage my time effectively to meet all my commitments without increasing my anxiety level, which is already at 5/10 ->-> 4,18",
      id: 274,
      role: "user",
    },
    {
      content:
        "Absolutely, staying focused is crucial, especially given your tight deadlines and the recent activities you've been involved in. Here are some key points to emphasize the importance of staying focused and how to manage your time effectively:\n\n### Importance of Staying Focused\n1. **Meeting Deadlines**: With your final draft deadline set for October 1, 2024, maintaining focus ensures you meet this critical milestone. Missing this deadline could impact your ability to submit your work for opportunities like the Montserrat Film Festival or local TV pitches.\n\n2. **Quality of Work**: Consistent focus allows you to produce higher-quality writing. Rushing or being distracted can lead to errors and less polished content, which can affect the reception of your work.\n\n3. **Mental Health**: Regular writing sessions help maintain a routine, which is beneficial for your mental health. It reduces stress and anxiety associated with looming deadlines and helps you stay motivated.\n\n### Managing Your Time Effectively\n1. **Block Dedicated Writing Time**: Continue blocking off specific times for writing, such as your scheduled 2-hour sessions on Mondays, Wednesdays, and Fridays at 7 PM. Additionally, consider adding more time if needed, like the Saturday 10 AM sessions you started in May.\n\n2. **Prioritize Tasks**: Prioritize your writing tasks based on urgency and importance. For example, focus on completing the 1,800-word weekly targets first, then move on to editing and revising.\n\n3. **Use Tools and Resources**: Leverage the tools and resources you have, such as Grammarly, Hemingway Editor, and ProWritingAid, to streamline your editing process. This can save you time and ensure your writing is polished.\n\n4. **Set Milestones**: Break down your final draft into smaller, manageable milestones. For instance, aim to complete certain sections or chapters by specific dates leading up to October 1. This can help you track your progress and stay motivated.\n\n5. **Limit Distractions**: Minimize distractions during your writing sessions. Turn off notifications on your phone, close unnecessary tabs on your computer, and create a quiet environment conducive to focused work.\n\n### Recent Activities and Their Impact\n1. **Webinar Success**: The success of the September 10 webinar with Carla is a positive sign. It shows that you can handle multiple projects simultaneously. Use this momentum to push forward with your writing.\n\n2. **Feedback Utilization**: Incorporate the feedback from the webinar and previous peer reviews into your writing. This can help you refine your work and stay on track with your goals.\n\n### Next Steps\n1. **Review Progress**: Check your progress against your weekly 1,800-word targets. If you find you are falling behind, adjust your schedule to dedicate more time to writing.\n\n2. **Seek Support**: Don't hesitate to reach out to your writing community, including Michael, Joseph, and Amy, for support and encouragement. They can provide valuable insights and motivation.\n\n3. **Celebrate Milestones**: As you reach each milestone, take a moment to celebrate your progress. This can boost your morale and keep you motivated.\n\nBy staying focused and managing your time effectively, you can successfully meet your deadline and produce a high-quality final draft. Good luck!",
      id: 297,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "timeline-date-format-instruction",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 15,
        subtopics: [
          "Grammar and syntax auditing",
          "Clarity vs. concision trade-offs",
          "Tone calibration",
          "Editing checklists",
        ],
        theme:
          "Techniques, tools, and mental models for refining writing quality over time",
        title:
          "Developing a Self-Editing System for Lifelong Writing Improvement",
      },
      narratives: "Timeline date format instruction following",
      probing_questions: {
        instruction_following: [
          {
            compliance_indicators: ["Month Day, Year format", "full month name", "numerical day and year"],
            difficulty: "medium",
            expected_compliance:
              "Response should present the date in the specified format with the full month name, day, and year.",
            instruction_being_tested:
              "Always format dates as \"Month Day, Year\" when I ask about timeline details.",
            instruction_type: "format_instruction",
            non_compliance_signs: ["numeric-only dates", "abbreviated month names", "dates without day or year", "other date formats"],
            question:
              "When was the Montserrat Writers’ Festival?",
            question_id: "timeline-date-format-instruction",
            question_type: "instruction_following",
            rubric: ["LLM response should contain: Month Day, Year format"],
            source_chat_ids: [66],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Writer tracking literary festival timelines",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}


function buildFestivalRelationshipDurationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda curious, as someone who's 60 and has a pretty established career in TV/film production, earning about $85,000 annually, how do I balance my professional life with the idea of free will, you know, like making choices that truly reflect my desires ->-> 1,2",
      id: 0,
      role: "user",
    },
    {
      content:
        "Balancing your professional life with the concept of free will involves aligning your career choices with your personal values and desires. At 60, you have a wealth of experience and a unique perspective that can guide you in making decisions that are true to yourself. Here are some steps you might consider:\n\n1. **Reflect on Your Values**: Take time to think about what is most important to you in life. Is it creative fulfillment, financial security, work-life balance, or something else? Understanding your core values can help you make choices that resonate with your inner self.\n\n2. **Assess Your Current Situation**: Evaluate your current role and responsibilities. Are there aspects of your job that you love and others that feel like a burden? Identifying these can help you decide whether to stay in your current position or seek new opportunities.\n\n3. **Set Personal Goals**: Define what success looks like for you outside of just financial gain. This could involve setting goals related to personal growth, health, family, or community involvement. These goals can serve as a compass for your decision-making process.\n\n4. **Explore New Opportunities**: If you find that your current role doesn't fully align with your desires, consider exploring new opportunities within your field or even outside of it. This could mean taking on different projects, learning new skills, or even starting a side business that aligns more closely with your passions.\n\n5. **Seek Feedback and Support**: Sometimes, talking things through with trusted colleagues, mentors, or friends can provide valuable insights and support. They might offer perspectives you haven't considered or encourage you to take risks that align with your true desires.\n\n6. **Take Action**: Once you've reflected and planned, it's important to take action. Whether this means making small changes in your daily routine or pursuing a significant career shift, the key is to move forward in a way that feels authentic to you.\n\nWould you like to explore specific strategies for finding new opportunities that align with your personal values?",
      id: 1,
      role: "assistant",
    },
    {
      content:
        "I've been in a relationship with Stephen, 53, for 5 years now, and we met at the Montserrat Film Festival in 2018, but I'm not sure how he'd react if I told him I'm having doubts about whether our choices are really our own ->-> 1,6)",
      id: 28,
      role: "user",
    },
    {
      content:
        "It's important to approach this conversation thoughtfully, especially given the depth of your relationship with Stephen. Discussing philosophical and existential topics can be sensitive, but it can also be an opportunity for deeper connection and understanding. Here are some steps to help you navigate this conversation:\n\n1. **Choose the Right Time and Setting**:\n   - Find a quiet and comfortable setting where you both can talk without distractions.\n   - Choose a time when Stephen is likely to be relaxed and receptive to a thoughtful conversation.\n\n2. **Express Your Thoughts Gently**:\n   - Start by expressing your appreciation for your relationship and the trust you share.\n   - Introduce the topic gently, explaining that you've been reflecting on the nature of free will and how it relates to your choices.\n\n3. **Provide Context**:\n   - Share some background on why this topic is important to you, such as recent readings, discussions with friends, or personal experiences.\n\n4. **Use Examples**:\n   - Provide specific examples of how you've been trying to balance discipline with the idea of free will in your daily life.\n   - Share a recent experience where you felt you were able to make a choice that was both disciplined and reflective of your free will.\n\n5. **Ask for His Perspective**:\n   - Politely ask Stephen for his thoughts on the balance between discipline and free will.\n   - Encourage him to share any experiences or insights he has gained over the years that might be relevant to this discussion.\n\n6. **Listen Actively**:\n   - Pay close attention to his responses and show genuine interest in his perspective.\n   - Avoid interrupting or dismissing his views, even if they differ from yours.\n\n7. **Seek Common Ground**:\n   - Look for areas where your views align with his and emphasize the mutual benefits of maintaining discipline while also embracing free will.\n\nHere's a refined version of the script to help you get started:\n\n---\n\n\"Stephen, I hope you're doing well. I wanted to talk to you about something that's been on my mind lately. First, I just want to say how much I appreciate our relationship and the trust we share. We've been together for five years now, and I feel very fortunate to have you in my life.\n\nRecently, I've been reflecting on the nature of free will and how it relates to our choices. I've been thinking about how to balance the discipline we both value with the idea of making choices that truly reflect our desires. For example, I've started setting aside time each week to try new activities or explore different hobbies. I find that this helps me stay engaged and open to new experiences.\n\nCould you share your thoughts on this? I'd love to hear your perspective on how to balance discipline with the freedom to make meaningful choices. I think your insights could be really helpful as I continue to grow and evolve.\"\n\n---\n\nThis approach shows respect for Stephen's perspective while also opening up a dialogue about your evolving thoughts on free will. Good luck with your conversation! Let me know how it goes, and feel free to reach out if you need any further assistance.",
      id: 29,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "festival-relationship-duration",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 17,
        subtopics: [
          "Philosophical definitions of free will",
          "Determinism and scientific perspectives",
          "Compatibilism vs. incompatibilism",
          "Impact on personal responsibility",
        ],
        theme:
          "Weighing philosophical, scientific, and practical consequences of accepting or rejecting free will",
        title:
          "Considering Whether to Believe in and Live by the Idea of Free Will",
      },
      narratives: "Festival relationship duration extraction",
      probing_questions: {
        information_extraction: [
          {
            answer: "You said you had been with Stephen for 5 years, and you met him at the Montserrat Film Festival in 2018.",
            conversation_reference:
              "Turn 1: Early mention of relationship details",
            difficulty: "medium",
            key_facts_tested: ["duration: 5 years", "meeting event: Montserrat Film Festival", "relationship start timing"],
            question:
              "How long had I been with the person I mentioned meeting at that festival before we started dating?",
            question_id: "festival-relationship-duration",
            question_type: "duration_recall",
            rubric: ["LLM response should state: 5 years"],
            source_chat_ids: [1],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: TV/film producer reflecting on free will",
        user_relationships: "Stephen",
      },
      user_questions: [],
    },
  ];
}


function buildOnboardingModulesCompletionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I need to finalize my career decision by April 1, 2024, to meet the startup's onboarding deadline, what are some factors I should consider to make an informed choice? ->-> 1,10",
      id: 42,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that declining the $5,000 freelance project on April 1 might have been a mistake, can you help me figure out if focusing on the new job's onboarding tasks was the right call? ->-> 2,8",
      id: 82,
      role: "user",
    },
    {
      content:
        "I'm trying to achieve a 95% quiz score by April 25 for my onboarding modules, but I'm kinda worried that setting such a high goal might be unrealistic, can you help me break it down into smaller tasks to make it more manageable? ->-> 2,16",
      id: 108,
      role: "user",
    },
    {
      content:
        "Absolutely! Setting a high goal like achieving a 95% quiz score by April 25 is ambitious, but breaking it down into smaller, manageable tasks can make it more achievable. Here's a step-by-step plan to help you reach your goal:\n\n### Step-by-Step Plan\n\n1. **Assess Current Knowledge**:\n   - **Initial Quiz**: Take an initial quiz to gauge your current knowledge level and identify areas that need improvement.\n   - **Example**: If you take an initial quiz and score 70%, you know you need to improve by 25 percentage points.\n\n2. **Break Down the Material**:\n   - **Module Segmentation**: Divide the onboarding material into smaller segments or modules.\n   - **Example**: If there are 10 modules, focus on mastering one module per day.\n\n3. **Create a Study Schedule**:\n   - **Daily Study Time**: Allocate specific times each day for studying.\n   - **Example**: Study for 1 hour each day from April 1 to April 25.\n\n4. **Set Intermediate Goals**:\n   - **Weekly Milestones**: Set weekly goals to track your progress.\n   - **Example**: Aim to complete and review 2-3 modules per week.\n\n5. **Practice Quizzes**:\n   - **Regular Quizzes**: Take practice quizzes regularly to assess your understanding and retention.\n   - **Example**: Take a practice quiz at the end of each module to ensure you have mastered the content.\n\n6. **Review and Revise**:\n   - **Daily Review**: Spend 15-30 minutes each day reviewing the material you studied.\n   - **Weekly Review**: Dedicate one day each week to a comprehensive review of all the modules covered that week.\n\n7. **Seek Help When Needed**:\n   - **Ask for Assistance**: If you encounter difficult topics, don't hesitate to ask for help from colleagues or mentors.\n   - **Example**: Schedule a 30-minute session with a mentor to clarify any confusing concepts.\n\n8. **Stay Motivated**:\n   - **Track Progress**: Keep a log of your progress and celebrate small victories along the way.\n   - **Motivation Techniques**: Use motivational techniques such as rewards for meeting milestones or visual reminders of your goal.\n\n### Detailed Weekly Plan\n\n#### Week 1 (April 1 - April 7)\n- **Day 1 (April 1)**: Initial assessment quiz.\n- **Days 2-7**: Study and review Modules 1-3.\n  - **Daily**: Study 1 module and take a practice quiz.\n  - **Weekly Review**: Spend 1 hour reviewing Modules 1-3.\n\n#### Week 2 (April 8 - April 14)\n- **Days 8-14**: Study and review Modules 4-6.\n  - **Daily**: Study 1 module and take a practice quiz.\n  - **Weekly Review**: Spend 1 hour reviewing Modules 4-6.\n\n#### Week 3 (April 15 - April 21)\n- **Days 15-21**: Study and review Modules 7-9.\n  - **Daily**: Study 1 module and take a practice quiz.\n  - **Weekly Review**: Spend 1 hour reviewing Modules 7-9.\n\n#### Week 4 (April 22 - April 25)\n- **Days 22-24**: Study and review Module 10.\n  - **Daily**: Study 1 module and take a practice quiz.\n  - **Comprehensive Review**: Spend 2 hours reviewing all 10 modules.\n- **Day 25 (April 25)**: Final review and take the final quiz.\n\n### Example Daily Schedule\n\n- **7:00 AM**: Wake up and start your day with a short meditation or stretching routine.\n- **7:15 AM**: Exercise for 30 minutes.\n- **7:45 AM**: Shower and get dressed.\n- **8:15 AM**: Prepare and eat a nutritious breakfast.\n- **8:45 AM**: Review your to-do list and check emails.\n- **9:00 AM**: Start work.\n- **12:00 PM**: Take a lunch break and relax for 30 minutes.\n- **1:30 PM**: Study for 1 hour (focus on one module).\n- **2:30 PM**: Take a practice quiz for the module.\n- **3:00 PM**: Continue work.\n- **5:00 PM**: End workday.\n- **5:30 PM**: Engage in a relaxing activity (e.g., reading, watching a movie, or spending time with family).\n- **7:30 PM**: Prepare and eat dinner.\n- **8:30 PM**: Spend 15-30 minutes reviewing the day's study material.\n- **9:00 PM**: Go to bed.\n\n### Conclusion\n\nBy breaking down your goal into smaller, manageable tasks and creating a structured study schedule, you can increase your chances of achieving a 95% quiz score by April 25. Regular practice quizzes, daily reviews, and seeking help when needed will all contribute to your success. Stay motivated and track your progress to stay on track.\n\nIf you have any specific concerns or need further guidance, feel free to share them, and we can explore additional strategies to help you reach your goal.",
      id: 109,
      role: "assistant",
    },
    {
      content:
        "Always confirm dates when I ask about scheduled events. ->-> 3,22",
      id: 264,
      role: "user",
    },
    {
      content:
        "Got it! I'll make sure to confirm dates whenever you ask about scheduled events. Let's proceed with that in mind.\n\n### Confirming Dates for Scheduled Events\n\nTo ensure clarity and accuracy, I'll always verify the dates of any scheduled events you mention. Here are a few examples of how we can handle this:\n\n1. **Upcoming Meetings**:\n   - **Example**: \"I have a meeting with Matthew on April 6.\"\n   - **Response**: \"Confirming the date, you have a meeting with Matthew on April 6. Is there anything specific you need to prepare for this meeting?\"\n\n2. **Work-Related Deadlines**:\n   - **Example**: \"I need to complete all onboarding modules by April 25.\"\n   - **Response**: \"Confirming the deadline, you need to complete all onboarding modules by April 25. Have you set a schedule to ensure you meet this deadline?\"\n\n3. **Personal Events**:\n   - **Example**: \"Stephen and I are celebrating our anniversary on April 4.\"\n   - **Response**: \"Confirming the date, you and Stephen are celebrating your anniversary on April 4. Is everything planned for the celebration?\"\n\n4. **Professional Travel**:\n   - **Example**: \"I have a work trip scheduled for June.\"\n   - **Response**: \"Confirming the month, you have a work trip scheduled for June. Do you have specific dates within June that you need to check?\"\n\n### Example Scenario\n\nLet's say you mention an upcoming event:\n\n**You**: \"I have a team-building event at The Harbor Lounge on April 10.\"\n\n**Me**: \"Confirming the date, you have a team-building event at The Harbor Lounge on April 10. Is there anything specific you need to prepare for this event?\"\n\nWould you like to confirm any specific dates or events now?",
      id: 265,
      role: "assistant",
    },
    {
      content:
        "Sure, let's confirm a few dates:\n\n**Team-Building Event**: Yep, it's on April 10 at The Harbor Lounge. I need to make sure I'm prepared for it.\n\n**Onboarding Modules Deadline**: Correct, I need to finish all the onboarding modules by April 25. I've set a schedule to make sure I meet this deadline.\n\n**Anniversary Celebration**: Right, Stephen and I are celebrating our anniversary on April 4. Everything is pretty much planned out.\n\n**Work Trip**: Scheduled for June, but I haven't got specific dates yet. I'll need to check with the team to confirm those.\n\nIs there anything else you want to confirm?",
      id: 268,
      role: "user",
    },
    {
      content:
        "Great! Let's confirm each of the dates and events you mentioned:\n\n### Team-Building Event\n**Event**: Team-building event at The Harbor Lounge.\n**Date**: April 10.\n**Preparation**: You need to make sure you are prepared for it.\n\n**Confirmation**: Confirmed, you have a team-building event at The Harbor Lounge on April 10. It's good to know you are preparing for it.\n\n### Onboarding Modules Deadline\n**Event**: Completing all onboarding modules.\n**Date**: April 25.\n**Preparation**: You have set a schedule to meet this deadline.\n\n**Confirmation**: Confirmed, you need to complete all onboarding modules by April 25. It's great that you have a schedule in place to ensure you meet this deadline.\n\n### Anniversary Celebration\n**Event**: Celebrating your anniversary with Stephen.\n**Date**: April 4.\n**Preparation**: Everything is pretty much planned out.\n\n**Confirmation**: Confirmed, you and Stephen are celebrating your anniversary on April 4. It's good to hear that everything is planned out.\n\n### Work Trip\n**Event**: Work trip.\n**Month**: June.\n**Details**: Specific dates are not confirmed yet.\n\n**Confirmation**: Confirmed, you have a work trip scheduled for June. You will need to check with the team to confirm the specific dates.\n\nIs there anything else you want to confirm or discuss regarding these events or any other scheduled activities?",
      id: 269,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "onboarding-modules-completion",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Philosophical or Ethical Discussion",
        id: 17,
        subtopics: [
          "Philosophical definitions of free will",
          "Determinism and scientific perspectives",
          "Compatibilism vs. incompatibilism",
          "Impact on personal responsibility",
        ],
        theme:
          "Weighing philosophical, scientific, and practical consequences of accepting or rejecting free will",
        title:
          "Considering Whether to Believe in and Live by the Idea of Free Will",
      },
      narratives: "Onboarding modules completion knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer: "By April 22",
            question:
              "By what date am I aiming to complete all my onboarding modules?",
            question_id: "onboarding-modules-completion",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[108],"updated_info":[]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: New hire pacing onboarding module quizzes",
        user_relationships: "Matthew",
      },
      user_questions: [],
    },
  ];
}


function buildOutlanderReadingDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Always provide detailed genre descriptions when I ask about book recommendations. ->-> 1,22",
      id: 62,
      role: "user",
    },
    {
      content:
        "If you find yourself in a situation where you can't reschedule a work call but really need to attend the book club meeting, here are some backup plans to consider:\n\n### Attend the Book Club Virtually\n1. **Virtual Participation**: If the book club allows it, see if you can join virtually via a video call or audio stream. Many book clubs are becoming more flexible and might accommodate remote participation.\n2. **Ask for a Recording**: Request if the meeting can be recorded or if someone can take detailed notes. This way, you can catch up on the discussion later.\n\n### Shorten Your Work Call\n1. **Request a Shorter Call**: If the work call is lengthy, see if you can shorten it or make it more efficient. Sometimes, a brief update can suffice instead of a full meeting.\n2. **Split the Time**: If the call is unavoidable, see if you can split the time. For example, attend the first part of the call and then join the book club meeting, or vice versa.\n\n### Delegate or Postpone Non-Critical Tasks\n1. **Delegate Tasks**: If there are non-critical tasks you can delegate, do so to free up your time. This might involve asking a colleague to handle parts of the call or to take notes.\n2. **Postpone Less Urgent Items**: Identify any less urgent items that can be postponed until after the book club meeting.\n\n### Use Breaks Wisely\n1. **Take Advantage of Breaks**: If the work call has natural breaks or pauses, use those moments to quickly catch up on any book club-related discussions.\n2. **Quick Sync-Up**: If you can't fully participate, ask a trusted member of the book club to give you a quick summary or key points during a break in the call.\n\n### Example Scenarios\n#### Virtual Participation\n- **Message to Kelly**: \"Hi Kelly, I have a work call at 7:30 PM that I can't reschedule. Can I join the book club meeting virtually? Or can someone record the discussion so I can catch up later?\"\n\n#### Shorten the Work Call\n- **Message to Your Team**: \"Hi Team, I have a book club meeting at 7 PM and a scheduled call at 7:30 PM. Can we make this call shorter or more efficient? I need to leave by 8 PM to attend the book club.\"\n\n#### Delegate Tasks\n- **Message to a Colleague**: \"Hi [Colleague], I have a book club meeting at 7 PM and a work call at 7:30 PM. Can you handle parts of the call or take detailed notes? I'll need to leave by 8 PM.\"\n\n### Example Messages\n#### Virtual Participation\n---\n\n**Hi Kelly,**\n\nI have a work call at 7:30 PM that I can't reschedule. Is it possible for me to join the book club meeting virtually? Alternatively, can someone record the discussion or take detailed notes so I can catch up later?\n\nThanks for understanding!\n\nBest,\n[Your Name]\n\n---\n\n#### Shorten the Work Call\n---\n\n**Hi Team,**\n\nI have a book club meeting at 7 PM and a scheduled call at 7:30 PM. Can we make this call shorter or more efficient? I need to leave by . \n\nLet me know if this works for everyone.\n\nBest,\n[Your Name]\n\n---\n\nBy using these backup plans, you can better manage conflicting commitments and ensure you don't miss out on important activities. Would you like any more specific advice or assistance with this?",
      id: 95,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide on a must-read fiction series for winter evenings, and I've extended my reading challenge goal to 12 books by March 1, which means I need to increase my weekly reading pace ->-> 2,22",
      id: 136,
      role: "user",
    },
    {
      content:
        "Certainly! If you're hesitant about trying an audiobook narrated by Julia DuMaurier for \"The Poppy War,\" there are other excellent fantasy series with historical elements that you might enjoy. Here are some recommendations along with their narrators:\n\n### Audiobooks for Evening Relaxation\n\n1. **\"The Expanse\" by James S.A. Corey**\n   - **Overview**: A space opera series with political intrigue and well-developed characters.\n   - **Narrator**: Simon Vance and Liza Ross\n   - **Why It Fits**: The audiobooks are well-narrated and can be listened to during evening relaxation. The series offers a balance of action and character development that is perfect for unwinding after a long day.\n\n2. **\"The Name of the Wind\" by Patrick Rothfuss**\n   - **Overview**: A fantasy novel with rich world-building and engaging storytelling.\n   - **Narrator**: Jim Dale\n   - **Why It Fits**: The audiobook is well-narrated and can be a great way to unwind after a long day. The immersive narrative will help you escape into a different world.\n\n3. **\"The Broken Earth\" by N.K. Jemisin**\n   - **Overview**: A fantasy series that won the Hugo Award for Best Novel three years in a row, featuring a unique magic system and powerful themes.\n   - **Narrator**: Liza Ross\n   - **Why It Fits**: The audiobook is well-narrated and can be enjoyed during evening relaxation. The engaging plot will keep you interested without overwhelming you.\n\n### Print Books for Immersive Weekend Reading\n\n1. **\"The Mistborn Trilogy\" by Brandon Sanderson**\n   - **Overview**: A fantasy series with a unique magic system and compelling plot.\n   - **Why It Fits**: The rich world-building and engaging characters make it perfect for immersive weekend reading. The detailed narrative will help you relax and lose yourself in the story.\n\n2. **\"The Kingkiller Chronicle\" by Patrick Rothfuss**\n   - **Overview**: A fantasy series with a richly detailed world and engaging narrative.\n   - **Why It Fits**: The first book, \"The Name of the Wind,\" is a standalone novel that can be enjoyed on its own and is perfect for immersive weekend reading. The detailed storytelling will help you relax and escape into the world.\n\n3. **\"The Poppy War\" by R.F. Kuang**\n   - **Overview**: A historical fantasy series with strong character development and political intrigue.\n   - **Why It Fits**: The detailed world-building and engaging plot make it ideal for immersive weekend reading. The detailed storytelling will help you relax and lose yourself in the story.\n\n### Alternative Audiobook Recommendations\n\n1. **\"The Lies of Locke Lamora\" by Scott Lynch**\n   - **Overview**: A fantasy novel with a blend of historical and fantasy elements, focusing on a band of thieves.\n   - **Narrator**: Simon Vance\n   - **Why It Fits**: The audiobook is well-narrated and can be enjoyed during evening relaxation. The engaging plot and historical elements will keep you interested.\n\n2. **\"The Hundred Thousand Kingdoms\" by N.K. Jemisin**\n   - **Overview**: A fantasy novel with a unique magic system and powerful themes, set in a world with historical elements.\n   - **Narrator**: Bahni Turpin\n   - **Why It Fits**: The audiobook is well-narrated and can be enjoyed during evening relaxation. The engaging plot and historical elements will keep you interested.\n\n3. **\"The Farseer Trilogy\" by Robin Hobb**\n   - **Overview**: A fantasy series with a blend of historical and fantasy elements, focusing on a young prince and his journey.\n   - **Narrator**: Martin Shaw\n   - **Why It Fits**: The audiobook is well-narrated and can be enjoyed during evening relaxation. The engaging plot and historical elements will keep you interested.\n\n### Example Message to Kelly\n---\n\n**Hi Kelly,**\n\nI've extended my reading challenge goal to 12 books by March 1, which means I need to increase my weekly reading pace. I'm looking for a must-read fiction series for winter evenings that can help me relax after a long day, like my current favorite, which I switched to audiobooks for evening reading after 8 PM to reduce eye strain. I've never listened to any audiobook narrated by the recommended narrator for \"The Poppy War,\" and I'm wondering if I should give it a try or look for other fantasy series with historical elements. Do you have any recommendations?\n\nBest,\n[Your Name]\n\n---\n\n### Conclusion\nHere are some alternative recommendations that should help you meet your increased weekly reading pace:\n\n- **Audiobooks for Evening Relaxation**:\n  - \"The Expanse\" by James S.A. Corey (Narrated by Simon Vance and Liza Ross)\n  - \"The Name of the Wind\" by Patrick Rothfuss (Narrated by Jim Dale)\n  - \"The Broken Earth\" by N.K. Jemisin (Narrated by Liza Ross)\n\n- **Alternative Audiobook Recommendations**:\n  - \"The Lies of Locke Lamora\" by Scott Lynch (Narrated by Simon Vance)\n  - \"The Hundred Thousand Kingdoms\" by N.K. Jemisin (Narrated by Bahni Turpin)\n  - \"The Farseer Trilogy\" by Robin Hobb (Narrated by Martin Shaw)\n\nBy balancing audiobooks for evening relaxation and print books for immersive weekend reading, you can stay engaged and on track with your reading challenge while also finding time to unwind.\n\nWould you like any more specific advice or recommendations?",
      id: 141,
      role: "assistant",
    },
    {
      content:
        "Can you help me figure out how to make the most of my reading time, given that I've committed to reading the first 4 \"Outlander\" books by June 30, and I have a discussion planned with Kelly, a fellow book club member, who I've been in touch with regarding our reading plans? ->-> 5,7",
      id: 274,
      role: "user",
    },
    {
      content:
        "I've committed to reading the first 4 \"Outlander\" books by June 30, but I'm worried about balancing my daily reading goal of 40 pages with my 8-hour workdays, do you have any time management tips? ->-> 5,13",
      id: 286,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about balancing my freelance editing job that starts on March 8 with my reading goals, especially since I've committed to reading the first 4 \"Outlander\" books by June 30, so can you help me prioritize my tasks and maybe suggest a daily schedule that includes both work and reading time? ->-> 5,18",
      id: 296,
      role: "user",
    },
    {
      content:
        "Always suggest related literary events when I ask about book series recommendations. ->-> 5,23",
      id: 306,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "outlander-reading-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 18,
        subtopics: [
          "Popular fantasy, sci-fi, and historical fiction series",
          "Standalone novels vs. multi-book sagas",
          "Award-winning authors and emerging voices",
          "Balancing page count with storytelling depth",
        ],
        theme:
          "Exploring different genres to find a captivating long-form reading experience",
        title:
          "Selecting a Must-Read Fiction Series for Winter Evenings",
      },
      narratives: "Outlander reading days interval reasoning",
      probing_questions: {
        temporal_reasoning: [
          {
            answer: "I have 114 days to finish reading the first four Outlander books after my freelance editing job starts on March 8 and before the June 30 deadline.",
            calculation_required: "June 30 - March 8 = 114 days",
            conversation_references: ["Session 1: freelance job start and reading goal"],
            difficulty: "easy",
            question:
              "How many days do I have to finish reading the first four Outlander books after my freelance editing job starts?",
            question_id: "outlander-reading-days",
            question_type: "temporal_reasoning",
            rubric: ["LLM response should state: 114 days", "LLM response should state: from March 8  till June 30"],
            source_chat_ids: {"first_event":[296],"second_event":[296]},
            temporal_type: "duration_calculation",
            time_points: ["March 8: freelance editing job starts", "June 30: reading goal deadline"],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Reader balancing freelance editing with a series goal",
        user_relationships: "Kelly",
      },
      user_questions: [],
    },
  ];
}


function buildMovieListGameNightDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to plan a family movie weekend and I need to adjust the schedule since Mason is arriving at 12 PM on April 7, so I shifted the movie start time from 1 PM to 12:30 PM, can you help me figure out if this new schedule will work for everyone? ->-> 3,5",
      id: 122,
      role: "user",
    },
    {
      content:
        "Hi, I've reviewed the plans and here's the message I'll send to Lily's parents:\n\n---\n\nHi [Lily's Parents' Names],\n\nI hope this message finds you well! We are looking forward to having you join us for our family movie weekend on May 11-12. Below are the final details to ensure everything goes smoothly:\n\n### Movie Schedule\n\n#### May 11, 2024\n- **2:00 PM:** \"Encanto\"\n- **4:30 PM:** \"Turning Red\"\n- **7:00 PM:** \"Onward\"\n- **9:00 PM:** \"The Princess Bride\" (with babysitter for Francis)\n\n#### May 12, 2024\n- **2:00 PM:** \"Strange World\"\n- **4:30 PM:** \"The One and Only Ivan\"\n- **7:00 PM:** \"Coco\"\n\n### Snacks and Activities\n- **Snacks:** We will have a variety of snacks, including tropical fruit platters, popcorn with custom seasonings, and themed cupcakes from The Sweet Spot bakery.\n- **Activities:** We have planned arts and crafts sessions, board games, and a karaoke session.\n\n### Supervision and Allergies\n- **Supervision:** We will have designated adults supervising the children during breaks and activities.\n- **Allergies:** Please let us know if there are any specific food allergies or dietary restrictions we should be aware of.\n\n### Final Confirmation\nCould you please confirm your attendance once more? We are excited to have you join us and look forward to a fun-filled weekend!\n\nThank you,\nCrystal\n\n---\n\nI'll send this now and await their response.",
      id: 192,
      role: "user",
    },
    {
      content:
        "Sounds good, Crystal! I'll send the message now and wait for their response. Thanks for the help with the details!\n\n---\n\nHi [Lily's Parents' Names],\n\nI hope this message finds you well! We are looking forward to having you join us for our family movie weekend on May 11-12. Below are the final details to ensure everything goes smoothly:\n\n### Movie Schedule\n\n#### May 11, 2024\n- **2:00 PM:** \"Encanto\"\n- **4:30 PM:** \"Turning Red\"\n- **7:00 PM:** \"Onward\"\n- **9:00 PM:** \"The Princess Bride\" (with babysitter for Francis)\n\n#### May 12, 2024\n- **2:00 PM:** \"Strange World\"\n- **4:30 PM:** \"The One and Only Ivan\"\n- **7:00 PM:** \"Coco\"\n\n### Snacks and Activities\n- **Snacks:** We will have a variety of snacks, including tropical fruit platters, popcorn with custom seasonings, and themed cupcakes from The Sweet Spot bakery.\n- **Activities:** We have planned arts and crafts sessions, board games, and a karaoke session.\n\n### Supervision and Allergies\n- **Supervision:** We will have designated adults supervising the children during breaks and activities.\n- **Allergies:** Please let us know if there are any specific food allergies or dietary restrictions we should be aware of.\n\n### Final Confirmation\nCould you please confirm your attendance once more? We are excited to have you join us and look forward to a fun-filled weekend!\n\nThank you,\nCrystal\n\n---\n\nSent! Looking forward to their response.",
      id: 194,
      role: "user",
    },
    {
      content:
        "I need to finalize the movie list by May 5 for our family weekend, considering Mason's suggestion to add a game night on May 11 and Emily's agreement to organize family-friendly board games ->-> 4,19",
      id: 208,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "movie-list-game-night-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 19,
        subtopics: [
          "Popular family-friendly genres",
          "Award-winning films and hidden gems",
          "Age ratings and content advisories",
          "Streaming platform exclusives",
        ],
        theme:
          "Balancing entertainment value, age appropriateness, and availability across platforms",
        title:
          "Finding the Best Streaming Movies for a Family Weekend",
      },
      narratives: "Movie list game night interval reasoning",
      probing_questions: {
        temporal_reasoning: [
          {
            answer: "There are 6 days between finalizing the movie list by May 5 and Mason's suggestion to add the game night on May 11.",
            calculation_required: "May 11 - May 5 = 6 days",
            conversation_references: ["Session 3: finalizing movie list", "Session 3: game night suggestion"],
            difficulty: "easy",
            question:
              "How many days are there between when I need to finalize my movie list for the family weekend and when Mason suggested adding the game night?",
            question_id: "movie-list-game-night-days",
            question_type: "temporal_reasoning",
            rubric: ["LLM response should state: 6 days", "LLM response should state: from May 5 till May 11"],
            source_chat_ids: {"first_event":[208],"second_event":[208]},
            temporal_type: "duration_calculation",
            time_points: ["May 5: finalize movie list", "May 11: game night suggested"],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Parent planning family movie weekends",
        user_relationships: "Francis, Michelle, Lily, Crystal",
      },
      user_questions: [],
    },
  ];
}


function buildSneakerChoiceRecallBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm Darryl, and I'm kinda curious, what are some comfy sneaker options for daily wear, considering I'm 32 and always on the go, you know? ->-> 1,2",
      id: 0,
      role: "user",
    },
    {
      content:
        "Hi Darryl! It's great that you're looking for comfortable sneakers for daily wear. Here are some popular and comfy options that might suit your needs:\n\n1. **Adidas Ultraboost**: These are known for their excellent cushioning and energy return, making them perfect for someone who's always on the move. They come in various styles and colors, so you can find one that matches your taste.\n\n2. **Nike Air Zoom Pegasus 38**: This model is designed for everyday comfort and durability. The Air Zoom unit in the forefoot provides responsive cushioning, while the breathable mesh upper keeps your feet cool.\n\n3. **New Balance 990v5**: Known for their classic design and superior comfort, the New Balance 990 series has been a favorite among sneaker enthusiasts. The v5 version offers an updated look with the same reliable comfort.\n\n4. **Saucony Ride ISO 4**: These sneakers feature a seamless upper that reduces irritation and enhances breathability. The PWRRUN cushioning provides a soft and responsive ride, ideal for all-day wear.\n\n5. **Brooks Ghost 14**: With its DNA LOFT cushioning, this shoe offers a plush feel underfoot. The engineered mesh upper provides a secure fit and excellent ventilation, making it suitable for various weather conditions.\n\n6. **Asics Gel-Kayano 28**: If you need extra support, this model is a great choice. It features a GEL cushioning system that absorbs shock and provides a smooth ride.\n\nThese sneakers are not only comfortable but also stylish enough to match different outfits. Depending on your specific needs (like arch support or breathability), you might want to try a few pairs to see which one feels best for you. Would you like more information on any of these models or details about how to choose the right size?",
      id: 1,
      role: "assistant",
    },
    {
      content:
        "You're welcome, Darryl! The Adidas Ultraboost and Brooks Ghost 14 are both excellent choices for comfort and support, especially given your daily walking routine. Heading to Foot Locker next Saturday to try them on is a great plan. Here are some additional tips and information to help you:\n\n### Stock Availability at Foot Locker\n- **Wide Selection**: Foot Locker typically carries a good selection of popular running and walking shoes, including the Adidas Ultraboost and Brooks Ghost 14.\n- **Neutral Colors**: They usually have a variety of neutral color options like black and white, which should match your work attire well.\n- **Size Range**: Foot Locker often stocks a range of sizes, so you should be able to find your size in the models you're interested in.\n\n### Tips for Trying Them On\n- **Bring Your Work Shoes**: If possible, bring a pair of shoes that you typically wear to work. This can help you gauge how the new sneakers will fit with your usual footwear.\n- **Walk Around**: Spend some time walking around the store in the shoes to get a feel for how they perform and fit.\n- **Check Support and Comfort**: Pay attention to how the shoes support your feet and how comfortable they feel during movement.\n\n### Additional Considerations\n- **Sales and Discounts**: Check if there are any current sales or discounts on the models you're interested in. Foot Locker often has promotions that can make the purchase more affordable.\n- **Customer Service**: Don't hesitate to ask the staff for recommendations or assistance. They can provide valuable insights and help you find the best fit.\n\n### Follow-Up\n- **Online Check**: If you have time, you might want to check the Foot Locker website or app to see if they have the specific models and sizes in stock at your local store. This can save you time and ensure you find what you're looking for.\n\n### Final Thought\nTrying on both the Adidas Ultraboost and Brooks Ghost 14 will help you determine which one feels better for your daily walks. Both are excellent choices, and you're likely to be very satisfied with either one.\n\nGood luck with your shopping trip next Saturday! If you have any more questions or need further assistance, feel free to reach out.",
      id: 27,
      role: "assistant",
    },
    {
      content:
        "I need help deciding if I should stick with my purchase decision of Adidas Ultraboost, which I chose on March 30, or explore other options before the discount at East Janethaven's Finish Line ends on April 5 ->-> 2,1",
      id: 66,
      role: "user",
    },
    {
      content:
        "Given your priorities and the details you've shared, the Adidas Ultraboost seems like a strong choice for your needs. Here are some points to consider to help you decide whether to stick with the Ultraboost or explore other options:\n\n### Pros of Sticking with Adidas Ultraboost:\n1. **Comfort and Support**: You've already tried them on and found them comfortable, which is crucial given your daily walking needs and mild flat feet.\n2. **Arch Support**: The Ultraboosts provide decent arch support, which should help with your condition.\n3. **Breathability**: The Primeknit upper is designed to be breathable, which is important in Montserrat's tropical climate.\n4. **Energy Return**: The Boost technology offers excellent energy return, making them suitable for daily wear and potentially enhancing your walking experience.\n5. **Discount Opportunity**: The 15% discount at Finish Line is a significant savings, especially within your budget limit of $200.\n\n### Cons of Sticking with Adidas Ultraboost:\n1. **Additional Support Needs**: If you find that you need more arch support, you might need to invest in additional insoles, which adds to the overall cost.\n2. **Limited Exploration**: By sticking with the Ultraboosts, you might miss out on discovering other models that could better suit your needs.\n\n### Exploring Other Options:\nIf you decide to explore other options, consider the following:\n\n1. **Nike Air Zoom Pegasus 38**: Known for its comfort and durability, this model also offers good arch support and breathability. It might be worth trying on if you're concerned about additional support.\n2. **New Balance Fresh Foam 1080v11**: This model is highly regarded for its cushioning and support, particularly for those with flat feet. It might provide the extra support you need without needing additional insoles.\n3. **Brooks Ghost 14**: Another excellent option for daily wear, offering good cushioning and support, especially for those who spend a lot of time on their feet.\n\n### Final Considerations:\n- **Try-On Experience**: Since you've already tried the Ultraboosts and found them comfortable, it might be worth sticking with a model you know works well for you.\n- **Discount Timing**: The discount at Finish Line ends on April 5, so you have limited time to make a decision. Missing out on the discount could mean spending more than your budget allows.\n- **Additional Research**: If you're still unsure, you could visit Foot Locker again to try on a few more models, but remember to factor in the time and effort required.\n\n### Recommendation:\nGiven your comfort with the Ultraboosts and the significant discount available, it seems prudent to go ahead with the purchase. If you're still hesitant, you could quickly visit Foot Locker one more time to try on a couple of other models, but be mindful of the discount deadline.\n\nWould you like to proceed with the Adidas Ultraboosts, or do you want to visit Foot Locker one more time to try on a few other models?",
      id: 67,
      role: "assistant",
    },
    {
      content:
        "That sounds like a great plan! Trying on Allbirds will give you a firsthand feel for how they compare to your Ultraboosts and help you determine if they're a good fit for your daily wear needs. Here are some tips to make the most of your store visit:\n\n### What to Look For When Trying On Allbirds:\n\n1. **Fit**:\n   - **Width and Length**: Make sure the sneakers fit well in terms of width and length. They should feel snug but not too tight.\n   - **Toe Room**: Ensure there is enough space in the toe box to avoid any pressure points.\n\n2. **Comfort**:\n   - **Initial Feel**: Pay attention to how the sneakers feel right from the start. The merino wool and eucalyptus fiber should provide a soft and comfortable sensation.\n   - **Walk Around**: Spend some time walking around the store to get a sense of how the sneakers perform in motion. Focus on how they feel on your feet and if they provide adequate support.\n\n3. **Arch Support**:\n   - **Footbed**: Notice how the footbed feels. Allbirds generally offer moderate arch support, which should be sufficient for mild flat feet. If you need more support, you might consider bringing along some insoles to test.\n\n4. **Breathability**:\n   - **Material Feel**: Assess how the natural materials (merino wool, eucalyptus fiber) feel against your skin. They should be breathable and moisture-wicking.\n\n5. **Styling**:\n   - **Color Options**: Try on the neutral colors like black, white, and grey to see how they match your usual work attire.\n   - **Versatility**: Consider how the minimalist design of Allbirds can work for both casual and slightly dressier settings.\n\n### Comparison with Ultraboosts:\n\n- **Energy Return**: Compare the energy return and cushioning of the Allbirds to your Ultraboosts. The Ultraboosts are known for their springy feel, so note any differences.\n- **Arch Support**: Evaluate the arch support provided by Allbirds. If you find it sufficient, you might not need additional insoles.\n- **Overall Comfort**: Determine which pair feels more comfortable for extended periods of wear.\n\n### Additional Tips:\n\n1. **Bring Your Work Attire**: If possible, bring a pair of pants or jeans that you typically wear to work to see how the Allbirds look and feel with your usual attire.\n2. **Ask for Help**: Don't hesitate to ask the store staff for recommendations or additional information about the Allbirds models.\n3. **Take Notes**: Jot down your impressions of the Allbirds compared to your Ultraboosts. This can help you make a more informed decision later.\n\n### Conclusion:\nTrying on Allbirds is a great way to see if they meet your needs for comfort, support, and styling. They can be a versatile addition to your sneaker collection, especially if you and Lauren both appreciate their minimalist design and neutral colors.\n\nEnjoy your store visit and let me know how the try-on goes! If you have any further questions or need more advice, feel free to reach out.",
      id: 83,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "sneaker-choice-recall",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 20,
        subtopics: [
          "Popular sneaker brands and their specialties",
          "Materials for breathability and support",
          "Trends in sneaker design",
          "Fit and sizing guides",
        ],
        theme:
          "Finding footwear that combines fashion, comfort, and durability",
        title:
          "Choosing Comfortable and Stylish Sneakers for Daily Wear",
      },
      narratives: "Sneaker choice preference recall extraction",
      probing_questions: {
        information_extraction: [
          {
            answer: "You said you chose the Adidas Ultraboost over the Nike React Infinity Run after trying both on March 30 at Foot Locker.",
            conversation_reference:
              "Turn 1: Initial choice and comparison mentioned",
            difficulty: "medium",
            key_facts_tested: ["choice: Adidas Ultraboost", "alternative: Nike React Infinity Run", "date: March 30", "location: Foot Locker"],
            question:
              "Which option did I say I chose after trying both at the store?",
            question_id: "sneaker-choice-recall",
            question_type: "preference_recall",
            rubric: ["LLM response should state: Adidas Ultraboost"],
            source_chat_ids: [1],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Shopper comparing daily-wear sneakers",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}


function buildSneakerBudgetComparisonReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've got a budget of around $65,000 annually, so I'm looking for something stylish and comfy to wear in East Janethaven, Montserrat, on March 12, 2024, can you help me out? ->-> 1,1",
      id: 4,
      role: "user",
    },
    {
      content:
        "I'm deciding between Adidas Ultraboost for $180 and Nike React Infinity Run for $160, which one should I choose for daily wear? ->-> 1,9",
      id: 32,
      role: "user",
    },
    {
      content:
        "Absolutely, Darryl! Reaching your daily walking goal of 10,000 steps by April 15, 2024, requires comfortable and supportive sneakers. Given your budget of $200, there are several excellent options that can help you achieve your goal. Here are some top choices:\n\n### 1. **Adidas Ultraboost**\n- **Price**: $180\n- **Features**:\n  - **Cushioning**: Exceptional cushioning and energy return thanks to the Boost midsole.\n  - **Upper**: Primeknit upper provides a snug, sock-like fit and excellent breathability.\n  - **Support**: Offers good support and a secure fit.\n  - **Traction**: Continental Rubber outsole provides excellent traction.\n\n### 2. **Nike React Infinity Run**\n- **Price**: $160\n- **Features**:\n  - **Cushioning**: Soft and responsive React foam provides a comfortable ride.\n  - **Upper**: Engineered mesh upper offers a secure and breathable fit.\n  - **Support**: Designed for long-distance comfort with a supportive fit.\n  - **Traction**: Waffle-patterned outsole offers good traction and durability.\n\n### 3. **New Balance Fresh Foam 1080v11**\n- **Price**: $140\n- **Features**:\n  - **Cushioning**: Fresh Foam midsole provides excellent cushioning and a smooth ride.\n  - **Upper**: Engineered mesh upper ensures breathability and a secure fit.\n  - **Support**: Offers good support and a comfortable fit.\n  - **Traction**: Durable rubber outsole provides reliable traction.\n\n### 4. **Brooks Ghost 14**\n- **Price**: $120\n- **Features**:\n  - **Cushioning**: DNA LOFT cushioning provides a plush and responsive feel.\n  - **Upper**: Engineered mesh upper offers a secure fit and breathability.\n  - **Support**: Segmented crash pad in the outsole provides excellent traction and durability.\n  - **Traction**: Reliable outsole for good grip.\n\n### 5. **Saucony Ride ISO 4**\n- **Price**: $120\n- **Features**:\n  - **Cushioning**: PWRRUN cushioning provides a soft and responsive ride.\n  - **Upper**: Seamless upper reduces irritation and provides a secure fit.\n  - **Support**: Offers good support and a comfortable fit.\n  - **Traction**: Everun topsole provides continuous cushioning and durability.\n\n### Recommendations\nGiven your goal of walking 10,000 steps daily and your budget of $200, here are some recommendations:\n\n1. **Adidas Ultraboost**: If you're willing to spend closer to $180, the Ultraboost offers exceptional cushioning and energy return, which can make your daily walks more enjoyable.\n2. **Nike React Infinity Run**: At $160, this model provides excellent comfort and support, making it a great choice for long-distance walking.\n3. **New Balance Fresh Foam 1080v11**: At $140, this is a more budget-friendly option that still offers excellent cushioning and support.\n4. **Brooks Ghost 14** or **Saucony Ride ISO 4**: Both are excellent choices at $120, offering good cushioning, support, and durability.\n\n### Tips for Your Shopping Trip\n1. **Visit Foot Locker**: Plan to visit Foot Locker on Main Street, East Janethaven, next Saturday at 3 PM. Make sure to check if they have the models you're interested in.\n2. **Try-On Session**: Spend time walking around in each pair to assess comfort, fit, and support.\n3. **Compare Models**: Try on both the Adidas Ultraboost and Nike React Infinity Run to directly compare their comfort and fit.\n4. **Ask for Assistance**: Utilize the staff's expertise to get recommendations and ensure you find the best fit.\n\n### Final Thoughts\nBy choosing a pair of sneakers that provide excellent cushioning, support, and comfort, you'll be well-equipped to reach your daily walking goal. Make sure to take your time and find the pair that feels the best for you.\n\nGood luck with your shopping trip and achieving your walking goal! If you have any more questions or need further assistance, feel free to reach out.",
      id: 37,
      role: "assistant",
    },
    {
      content:
        "I've got a budget limit of $200 for sneakers and I'm deciding between Adidas Ultraboost and Nike React Infinity Run, which one would you recommend for daily wear considering my budget cap? ->-> 1,12",
      id: 38,
      role: "user",
    },
    {
      content:
        "Given your budget limit of $200 and your goal of daily wear, both the Adidas Ultraboost and Nike React Infinity Run are excellent choices. However, let's break down the key differences to help you make the best decision:\n\n### Adidas Ultraboost\n- **Price**: $180\n- **Cushioning**: Exceptional cushioning and energy return thanks to the Boost midsole.\n- **Upper**: Primeknit upper provides a snug, sock-like fit and excellent breathability.\n- **Support**: Offers good support and a secure fit.\n- **Traction**: Continental Rubber outsole provides excellent traction.\n\n### Nike React Infinity Run\n- **Price**: $160\n- **Cushioning**: Soft and responsive React foam provides a comfortable ride.\n- **Upper**: Engineered mesh upper offers a secure and breathable fit.\n- **Support**: Designed for long-distance comfort with a supportive fit.\n- **Traction**: Waffle-patterned outsole offers good traction and durability.\n\n### Key Considerations\n1. **Cushioning and Energy Return**:\n   - **Adidas Ultraboost**: Known for its superior energy return and cushioning, which can make your daily walks more enjoyable and less fatiguing.\n   - **Nike React Infinity Run**: Offers a soft and responsive ride, though it may not have the same level of energy return as the Ultraboost.\n\n2. **Budget**:\n   - **Adidas Ultraboost**: Costs $180, which is within your budget but leaves less room for other expenses.\n   - **Nike React Infinity Run**: Costs $160, leaving you with $40 more in your budget for other items or future purchases.\n\n3. **Fit and Comfort**:\n   - **Adidas Ultraboost**: Primeknit upper provides a snug, sock-like fit that many find very comfortable.\n   - **Nike React Infinity Run**: Engineered mesh upper is also breathable and provides a secure fit, though it may feel slightly different from the Primeknit material.\n\n4. **Support and Traction**:\n   - Both models offer good support and reliable traction, so you won't be disappointed in either choice.\n\n### Recommendation\nGiven your budget limit of $200, the **Nike React Infinity Run** at $160 is a strong choice. It provides excellent comfort and support for daily wear, and staying within your budget will give you some financial flexibility for other needs.\n\n### Final Steps\n1. **Visit Foot Locker**: Plan to visit Foot Locker on Main Street, East Janethaven, next Saturday at 3 PM.\n2. **Try-On Session**: Spend time walking around in both the Adidas Ultraboost and Nike React Infinity Run to directly compare their comfort and fit.\n3. **Make a Decision**: Based on your personal comfort and budget considerations, choose the pair that feels best for you.\n\n### Conclusion\nThe Nike React Infinity Run is a great choice within your budget, offering excellent comfort and support for your daily walking goal. Enjoy your shopping trip and happy walking!\n\nIf you have any more questions or need further assistance, feel free to reach out. Good luck!",
      id: 39,
      role: "assistant",
    },
    {
      content:
        "I just placed an order for Ultraboost size 11 on Finish Line's website at 7:45 PM, April 1, and I'm wondering if I got a good deal since it was discounted to $153 with the coupon code SPRING15 from the original $180 price ->-> 2,4",
      id: 70,
      role: "user",
    },
    {
      content:
        "I'm kinda curious about how the $153 price I paid for the Ultraboost, which was discounted from $180, fits into my budget, considering I used the coupon code SPRING15 ->-> 2,5",
      id: 72,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "sneaker-budget-comparison-reasoning",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 20,
        subtopics: [
          "Popular sneaker brands and their specialties",
          "Materials for breathability and support",
          "Trends in sneaker design",
          "Fit and sizing guides",
        ],
        theme:
          "Finding footwear that combines fashion, comfort, and durability",
        title:
          "Choosing Comfortable and Stylish Sneakers for Daily Wear",
      },
      narratives: "Sneaker budget comparison reasoning",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "The price you paid for the Ultraboost is below your original budget limit of $200.",
            question:
              "How does the price I paid for the Ultraboost compare to my original budget limit for sneakers?",
            question_id: "sneaker-budget-comparison-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [38, 72],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Shopper comparing daily-wear sneakers",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildDailyWalkingGoalFestivalMonthsBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm deciding between Adidas Ultraboost for $180 and Nike React Infinity Run for $160, which one should I choose for daily wear? ->-> 1,9",
      id: 32,
      role: "user",
    },
    {
      content:
        "I'm trying to reach my daily walking goal of 10,000 steps by April 15, 2024, and I need comfy shoes, can you help me find the best sneakers for this challenge within my budget of $200? ->-> 1,11",
      id: 36,
      role: "user",
    },
    {
      content:
        "Absolutely, Darryl! Reaching your daily walking goal of 10,000 steps by April 15, 2024, requires comfortable and supportive sneakers. Given your budget of $200, there are several excellent options that can help you achieve your goal. Here are some top choices:\n\n### 1. **Adidas Ultraboost**\n- **Price**: $180\n- **Features**:\n  - **Cushioning**: Exceptional cushioning and energy return thanks to the Boost midsole.\n  - **Upper**: Primeknit upper provides a snug, sock-like fit and excellent breathability.\n  - **Support**: Offers good support and a secure fit.\n  - **Traction**: Continental Rubber outsole provides excellent traction.\n\n### 2. **Nike React Infinity Run**\n- **Price**: $160\n- **Features**:\n  - **Cushioning**: Soft and responsive React foam provides a comfortable ride.\n  - **Upper**: Engineered mesh upper offers a secure and breathable fit.\n  - **Support**: Designed for long-distance comfort with a supportive fit.\n  - **Traction**: Waffle-patterned outsole offers good traction and durability.\n\n### 3. **New Balance Fresh Foam 1080v11**\n- **Price**: $140\n- **Features**:\n  - **Cushioning**: Fresh Foam midsole provides excellent cushioning and a smooth ride.\n  - **Upper**: Engineered mesh upper ensures breathability and a secure fit.\n  - **Support**: Offers good support and a comfortable fit.\n  - **Traction**: Durable rubber outsole provides reliable traction.\n\n### 4. **Brooks Ghost 14**\n- **Price**: $120\n- **Features**:\n  - **Cushioning**: DNA LOFT cushioning provides a plush and responsive feel.\n  - **Upper**: Engineered mesh upper offers a secure fit and breathability.\n  - **Support**: Segmented crash pad in the outsole provides excellent traction and durability.\n  - **Traction**: Reliable outsole for good grip.\n\n### 5. **Saucony Ride ISO 4**\n- **Price**: $120\n- **Features**:\n  - **Cushioning**: PWRRUN cushioning provides a soft and responsive ride.\n  - **Upper**: Seamless upper reduces irritation and provides a secure fit.\n  - **Support**: Offers good support and a comfortable fit.\n  - **Traction**: Everun topsole provides continuous cushioning and durability.\n\n### Recommendations\nGiven your goal of walking 10,000 steps daily and your budget of $200, here are some recommendations:\n\n1. **Adidas Ultraboost**: If you're willing to spend closer to $180, the Ultraboost offers exceptional cushioning and energy return, which can make your daily walks more enjoyable.\n2. **Nike React Infinity Run**: At $160, this model provides excellent comfort and support, making it a great choice for long-distance walking.\n3. **New Balance Fresh Foam 1080v11**: At $140, this is a more budget-friendly option that still offers excellent cushioning and support.\n4. **Brooks Ghost 14** or **Saucony Ride ISO 4**: Both are excellent choices at $120, offering good cushioning, support, and durability.\n\n### Tips for Your Shopping Trip\n1. **Visit Foot Locker**: Plan to visit Foot Locker on Main Street, East Janethaven, next Saturday at 3 PM. Make sure to check if they have the models you're interested in.\n2. **Try-On Session**: Spend time walking around in each pair to assess comfort, fit, and support.\n3. **Compare Models**: Try on both the Adidas Ultraboost and Nike React Infinity Run to directly compare their comfort and fit.\n4. **Ask for Assistance**: Utilize the staff's expertise to get recommendations and ensure you find the best fit.\n\n### Final Thoughts\nBy choosing a pair of sneakers that provide excellent cushioning, support, and comfort, you'll be well-equipped to reach your daily walking goal. Make sure to take your time and find the pair that feels the best for you.\n\nGood luck with your shopping trip and achieving your walking goal! If you have any more questions or need further assistance, feel free to reach out.",
      id: 37,
      role: "assistant",
    },
    {
      content:
        "Always provide detailed comparisons when I ask about sneaker features. ->-> 1,22",
      id: 58,
      role: "user",
    },
    {
      content:
        "Always highlight health benefits when I ask about sneaker features. ->-> 3,23",
      id: 160,
      role: "user",
    },
    {
      content:
        "I've got a festival coming up on August 22 and I want to make sure my sneaker outfit is both comfortable and stylish, do you have any recommendations for sneakers that would be perfect for the occasion? ->-> 5,23",
      id: 270,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "daily-walking-goal-festival-months",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 20,
        subtopics: [
          "Popular sneaker brands and their specialties",
          "Materials for breathability and support",
          "Trends in sneaker design",
          "Fit and sizing guides",
        ],
        theme:
          "Finding footwear that combines fashion, comfort, and durability",
        title:
          "Choosing Comfortable and Stylish Sneakers for Daily Wear",
      },
      narratives: "Daily walking goal to festival months interval reasoning",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "There are about 4 months between April 15, 2024, when I planned to reach my daily walking goal, and August 22, 2024, the date of the festival I’m preparing my sneaker outfit for.",
            calculation_required: "August 22, 2024 - April 15, 2024 = about 4 months",
            conversation_references: ["Session 1: daily walking goal deadline", "Session 5: festival sneaker outfit"],
            difficulty: "medium",
            question:
              "How many months are there between when I planned to reach my daily walking goal and the festival I’m preparing my sneaker outfit for?",
            question_id: "daily-walking-goal-festival-months",
            question_type: "temporal_reasoning",
            rubric: ["LLM response should state: about 4 months", "LLM response should state: from April 15 to August 22"],
            source_chat_ids: {"first_event":[36],"second_event":[270]},
            temporal_type: "duration_calculation",
            time_points: ["April 15, 2024: daily walking goal", "August 22, 2024: festival"],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Shopper comparing daily-wear sneakers",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildHolidayGiftBudgetUpdateBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Tracking daily expenses can indeed become frustrating over time, especially when unexpected expenses like increased medical costs for Ashlee come into play. Here are some strategies to make the process less frustrating and more manageable:\n\n1. **Simplify Your Tracking Method**:\n   - **Use a Budgeting App**: Consider using a budgeting app like Mint, which automates much of the tracking process. This can save you time and reduce the manual effort required.\n   - **Batch Entry**: Instead of entering expenses daily, try batching entries once a week. This can make the task feel less repetitive and time-consuming.\n\n2. **Categorize Expenses Efficiently**:\n   - **Predefined Categories**: Set up predefined categories in your tracking tool to quickly assign expenses. For example, create a specific category for Ashlee's medical expenses.\n   - **Automated Categorization**: If you use a budgeting app, it often automatically categorizes expenses based on merchant names, making it easier to track.\n\n3. **Adjust Your Budget Regularly**:\n   - **Review and Adjust**: Regularly review your budget and adjust it to reflect new expenses, such as the increased medical costs for Ashlee. This ensures that your budget remains realistic and achievable.\n   - **Emergency Fund**: Consider increasing your emergency fund to cover unexpected expenses like medical costs. Aim to build it up to three months' worth of expenses by the end of the year.\n\n4. **Set Realistic Goals**:\n   - **Short-Term Milestones**: Break down your financial goals into smaller, achievable milestones. For example, focus on reducing dining out expenses to $200 per month or saving $500 towards your emergency fund each month.\n   - **Celebrate Successes**: Acknowledge and celebrate small successes along the way to keep yourself motivated.\n\n5. **Seek Support**:\n   - **Discuss with Spouse**: Talk to Alexis about your frustrations and involve her in the budgeting process. Sharing the responsibility can make it less overwhelming.\n   - **Financial Advisor**: Consider consulting a financial advisor for personalized advice and strategies to manage your finances effectively, especially given the increased medical expenses.\n\n6. **Use Technology to Your Advantage**:\n   - **Automatic Transfers**: Set up automatic transfers to your savings accounts to ensure consistent savings without having to manually transfer funds.\n   - **Mobile Apps**: Utilize mobile apps for banking and budgeting to streamline your financial management.\n\n7. **Stay Organized**:\n   - **Receipts and Statements**: Keep receipts and bank statements organized digitally or physically. This makes it easier to review and categorize expenses accurately.\n   - **Regular Reviews**: Schedule regular reviews of your financial situation to ensure everything is on track and make adjustments as needed.\n\nBy implementing these strategies, you can make the process of tracking daily expenses more manageable and less frustrating. Remember, the goal is to maintain a clear understanding of your finances while supporting your long-term goals and unexpected expenses like Ashlee's medical costs.",
      id: 71,
      role: "assistant",
    },
    {
      content:
        "I've agreed with Alexis on a $500 monthly joint budget for groceries starting Sept 1, which is up from $400, and I'm thinking about how this change will affect our expenses, especially with the contract I'm considering ->-> 3,3",
      id: 126,
      role: "user",
    },
    {
      content:
        "Always highlight changes in budget allocations when I ask about financial goals. ->-> 3,23",
      id: 208,
      role: "user",
    },
    {
      content:
        "I'm trying to stick to my strict spending caps during holidays to avoid overspending and stress, but with Alexis's family expecting a $150 holiday gift exchange, I'm worried I might go over my budget of $400 total for gifts ->-> 4,16",
      id: 250,
      role: "user",
    },
    {
      content:
        "I've adjusted our holiday gift budget to $450, can you help me plan how to allocate this amount among our family members? ->-> 4,22",
      id: 266,
      role: "user",
    },
    {
      content:
        "Always confirm budget caps when I ask about holiday spending. ->-> 4,23",
      id: 268,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "holiday-gift-budget-update",
      conversation_plan: "BATCH 4 PLAN",
      conversation_seed: {
        category: "Personal Finance",
        id: 21,
        subtopics: [
          "Budgeting and spending caps",
          "Holiday gift planning",
          "Family expense coordination",
          "Savings goals",
        ],
        theme:
          "Managing household budgets and seasonal spending",
        title:
          "Coordinating Family Budgets and Holiday Spending",
      },
      narratives: "Holiday gift budget knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer:
              "$450",
            difficulty: "medium",
            question:
              "What is my total budget for holiday gifts this year?",
            question_id: "holiday-gift-budget-update",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[250],"updated_info":[266]},
            update_type: "value_change",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Household budgeter coordinating family spending",
        user_relationships: "Alexis",
      },
      user_questions: [],
    },
  ];
}

function buildEmergencyFundDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda stressed about saving $2,000 for my emergency fund by June 30, 2024, and I've only got $500 saved so far, can you help me make a plan to reach my goal? ->-> 1,11",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm kinda stressed about my emergency fund, it currently covers 1 month's expenses, but I want it to cover 3 months by year-end, what's a good strategy to achieve that? ->-> 1,15",
      id: 42,
      role: "user",
    },
    {
      content:
        "I've finally reached $1,200 in my emergency fund by June 5, which is 60% of my $2,000 goal, and I'm feeling pretty good about it, but can you give me some advice on how to stay motivated to reach the full amount? ->-> 2,7",
      id: 76,
      role: "user",
    },
    {
      content:
        "I've got an emergency fund goal of $2,000 by June 30, 2024, and I just found out it now covers 65% of that, so how can I make sure I reach my target on time? ->-> 2,22",
      id: 114,
      role: "user",
    },
    {
      content:
        "I just reached my emergency fund goal of $2,000 on August 30, which is 3 months early, what's the best way to keep saving and maybe even increase my goal now? ->-> 3,9",
      id: 146,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "emergency-fund-days",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Personal Finance",
        id: 21,
        subtopics: [
          "Emergency fund milestones",
          "Savings motivation",
          "Budget allocation",
          "Spending caps",
        ],
        theme:
          "Building and tracking an emergency fund",
        title:
          "Reaching Emergency Fund Savings Goals",
      },
      narratives: "Emergency fund days interval reasoning",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "It took about 86 days to reach the full $2,000 emergency fund goal after having $1,200 saved by June 5, since the goal was reached on August 30.",
            calculation_required: "August 30 - June 5 = about 86 days",
            conversation_references: ["Session 2: $1,200 milestone", "Session 3: $2,000 goal reached"],
            difficulty: "medium",
            question:
              "How long did it take me to reach my full emergency fund goal after I had saved $1,200 by early June?",
            question_id: "emergency-fund-days",
            question_type: "temporal_reasoning",
            rubric: ["LLM response should state: about 86 days", "LLM response should state: from June 5 to August 30"],
            source_chat_ids: {"first_event":[76],"second_event":[146]},
            temporal_type: "duration_calculation",
            time_points: ["June 5: $1,200 saved", "August 30: $2,000 goal reached"],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Saver building an emergency fund",
        user_relationships: "Alexis",
      },
      user_questions: [],
    },
  ];
}

function buildPriorArtProvisionalPatentDaysBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried that my prior art search, which I plan to complete by April 10, 2024, using the USPTO database and Google Patents, might not be thorough enough, can you help me make sure I'm covering all bases? ->-> 1,9",
      id: 32,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the prior art search I completed on April 10, 2024, which found 3 similar patents but none with AI tagging features, so can you help me understand how this affects my decision to file a provisional patent by May 15, 2024? ->-> 2,2",
      id: 70,
      role: "user",
    },
    {
      content:
        "I've been thinking about my decision to file a provisional patent by May 15, 2024, to secure a priority date before the product launch, and I'm hoping that with the USPTO, my receipt number 12345678 will help me keep track of the progress, can you help me understand what's next in this process? ->-> 3,1",
      id: 124,
      role: "user",
    },
    {
      content:
        "Yeah, those tips make sense. I'll stick to creating a detailed logbook and using a structured format. I'll include all the necessary descriptions and visual aids, and keep updating it regularly. Storing the data securely and backing it up is a good idea too. I'll review and summarize the findings periodically and document any changes to the prototype. Thanks, Jake!",
      id: 300,
      role: "user",
    },
    {
      content:
        "Always provide clear summaries when I ask about patent drafting progress. ->-> 4,23",
      id: 302,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "prior-art-provisional-patent-days",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Intellectual Property",
        id: 25,
        subtopics: [
          "Prior art search strategy",
          "Provisional patent filing",
          "Patent timelines",
          "USPTO process",
        ],
        theme:
          "Navigating the patent application process",
        title:
          "Filing a Provisional Patent",
      },
      narratives: "Prior art to provisional patent days interval reasoning",
      probing_questions: {
        temporal_reasoning: [
          {
            answer:
              "There were 35 days between planning to complete the prior art search by April 10, 2024, and aiming to file the provisional patent by May 15, 2024.",
            calculation_required: "May 15, 2024 - April 10, 2024 = 35 days",
            conversation_references: ["Session 1: prior art search plan", "Session 2: provisional filing target"],
            difficulty: "medium",
            question:
              "How many days were there between when I planned to complete my prior art search and when I aimed to file my provisional patent?",
            question_id: "prior-art-provisional-patent-days",
            question_type: "temporal_reasoning",
            rubric: ["LLM response should state: 35 days", "LLM response should state: from April 10 to May 15"],
            source_chat_ids: {"first_event":[32],"second_event":[70]},
            temporal_type: "duration_calculation",
            time_points: ["April 10, 2024: prior art search", "May 15, 2024: provisional patent filing"],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Inventor preparing a patent application",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildProbateTimelineUpdateBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried about the probate process taking 6-9 months in Montserrat, so I wanna prepare my documents accordingly, you know, to make it smoother, especially since I chose to update my will digitally using WillMaker Pro for flexibility and ease of future edits ->-> 2,16",
      id: 110,
      role: "user",
    },
    {
      content:
        "I've got a question about the probate timeline that Stephanie explained, which typically takes 6-9 months in Montserrat, and I'm planning to prepare my documents accordingly, can you help me understand how this process works and what I need to do to prepare ->-> 2,17",
      id: 112,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the probate process, so can you tell me more about how it was shortened to 5-7 months and what that means for my estate planning, considering I've never used any digital software like WillMaker Pro to draft my will? ->-> 2,22, 24",
      id: 122,
      role: "user",
    },
    {
      content:
        "Certainly! Understanding the probate process and how it can be streamlined can help you better prepare your estate plan. Let's break down the key aspects of the probate process and how you can optimize it, even if you haven't used digital software like WillMaker Pro.\n\n### Probate Process Overview\n\n1. **Filing the Will:**\n   - **Submission to Probate Court:** After your death, your executor must submit your will to the probate court.\n   - **Verification:** The court verifies the authenticity of the will and ensures it meets all legal requirements.\n\n2. **Appointment of Executor:**\n   - **Court Approval:** The court formally appoints the executor named in your will.\n   - **Oath and Bond:** The executor may need to take an oath and post a bond, depending on local requirements.\n\n3. **Inventory and Appraisal:**\n   - **Asset Inventory:** The executor compiles a detailed inventory of all your assets.\n   - **Appraisal:** The executor may need to obtain appraisals for certain assets, such as real estate or valuable personal property.\n\n4. **Payment of Debts and Taxes:**\n   - **Notification of Creditors:** The executor notifies creditors and pays any outstanding debts.\n   - **Tax Filing:** The executor files any necessary tax returns and pays any taxes owed.\n\n5. **Distribution of Assets:**\n   - **Court Approval:** The executor obtains court approval before distributing assets to beneficiaries.\n   - **Distribution:** Once approved, the executor distributes the assets according to the terms of your will.\n\n6. **Closing the Estate:**\n   - **Final Accounting:** The executor provides a final accounting to the court, detailing all transactions and distributions.\n   - **Court Approval:** The court reviews the final accounting and, if satisfied, closes the estate.\n\n### Shortening the Probate Process\n\nTraditionally, the probate process in Montserrat can take 6-9 months. However, with careful planning and organization, it can be shortened to 5-7 months. Here are some strategies to help streamline the process:\n\n1. **Detailed and Comprehensive Will:**\n   - **Clear Instructions:** Ensure your will is clear and comprehensive, leaving no room for ambiguity.\n   - **Legal Compliance:** Make sure your will complies with all local laws and regulations.\n\n2. **Organized Asset Inventory:**\n   - **Detailed List:** Maintain a detailed list of all your assets, including real estate, bank accounts, investments, vehicles, and digital assets.\n   - **Access Information:** Provide clear instructions on how to access and manage each asset.\n\n3. **Executor Preparedness:**\n   - **Capable Executor:** Choose an executor who is capable and willing to handle the responsibilities.\n   - **Detailed Instructions:** Provide your executor with detailed instructions on how to manage your estate, including contact information for financial institutions, legal advisors, and other relevant parties.\n\n4. **Digital Tools:**\n   - **Software Benefits:** While you haven't used digital software like WillMaker Pro, consider using it to maintain a digital record of your will and asset inventory.\n   - **Ease of Access:** Digital tools can make it easier to update and access your documents, ensuring they are always current and readily available.\n\n5. **Regular Updates:**\n   - **Periodic Reviews:** Regularly review and update your will and estate plan to reflect any changes in your circumstances.\n   - **Flexibility:** Use tools like WillMaker Pro to make updates as needed, ensuring your documents remain current and legally sound.\n\n### Steps to Streamline the Probate Process\n\n1. **Prepare a Detailed Will:**\n   - **Comprehensive Content:** Ensure your will covers all aspects of your estate, including digital assets.\n   - **Legal Advice:** Consult with your attorney, Stephanie, to ensure your will is legally sound and compliant with Montserrat law.\n\n2. **Maintain an Organized Asset Inventory:**\n   - **Detailed List:** Keep a detailed list of all your assets, including their values and any associated debts.\n   - **Access Instructions:** Provide clear instructions on how to access and manage each asset.\n\n3. **Choose a Capable Executor:**\n   - **Willing and Able:** Select an executor who is willing and capable of handling the responsibilities.\n   - **Detailed Instructions:** Provide your executor with detailed instructions on how to manage your estate, including contact information and access details.\n\n4. **Consider Digital Tools:**\n   - **Software Benefits:** Even if you haven't used digital software before, consider using tools like WillMaker Pro to maintain a digital record of your will and asset inventory.\n   - **Ease of Access:** Digital tools can make it easier to update and access your documents, ensuring they are always current and readily available.\n\n5. **Regular Reviews and Updates:**\n   - **Periodic Reviews:** Regularly review and update your will and estate plan to reflect any changes in your circumstances.\n   - **Flexibility:** Use tools like WillMaker Pro to make updates as needed, ensuring your documents remain current and legally sound.\n\n### Example of a Streamlined Probate Process\n\nHere is an example of how you might streamline the probate process:\n\n1. **Prepare a Detailed Will:**\n   - **Comprehensive Content:** Ensure your will covers all aspects of your estate, including digital assets.\n   - **Legal Advice:** Consult with Stephanie to ensure your will is legally sound and compliant with Montserrat law.\n\n2. **Maintain an Organized Asset Inventory:**\n   - **Detailed List:** Keep a detailed list of all your assets, including their values and any associated debts.\n   - **Access Instructions:** Provide clear instructions on how to access and manage each asset.\n\n3. **Choose a Capable Executor:**\n   - **Willing and Able:** Select an executor who is willing and capable of handling the responsibilities.\n   - **Detailed Instructions:** Provide your executor with detailed instructions on how to manage your estate, including contact information and access details.\n\n4. **Consider Digital Tools:**\n   - **Software Benefits:** Even if you haven't used digital software before, consider using tools like WillMaker Pro to maintain a digital record of your will and asset inventory.\n  . **Ease of Access:** Digital tools can make it easier to update and access your documents, ensuring they are always current and readily available.\n\n5. **Regular Reviews and Updates:**\n   - **Periodic Reviews:** Regularly review and update your will and estate plan to reflect any changes in your circumstances.\n   - **Flexibility:** Use tools like WillMaker Pro to make updates as needed, ensuring your documents remain current and legally sound.\n\n### Conclusion\n\nBy preparing a detailed will, maintaining an organized asset inventory, choosing a capable executor, considering digital tools, and regularly reviewing and updating your estate plan, you can streamline the probate process and reduce potential delays. This will help ensure that your estate is managed efficiently and in accordance with your wishes.\n\nIf you have any specific concerns or need further guidance, feel free to reach out!",
      id: 123,
      role: "assistant",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "probate-timeline-update",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Estate Planning",
        id: 24,
        subtopics: [
          "Probate process and timelines",
          "Will preparation",
          "Estate documentation",
          "Digital will software",
        ],
        theme:
          "Preparing an estate plan and understanding probate",
        title:
          "Navigating Probate and Estate Planning",
      },
      narratives: "Probate timeline knowledge update",
      probing_questions: {
        knowledge_update: [
          {
            answer:
              "5-7 months",
            difficulty: "medium",
            question:
              "How long does the probate process usually take in Montserrat?",
            question_id: "probate-timeline-update",
            question_type: "knowledge_update",
            source_chat_ids: {"original_info":[112],"updated_info":[122]},
            update_type: "value_change",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Individual preparing an estate plan",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildWorkBoundaryOrderReasoningBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to set boundaries by limiting work emails after 7 PM, starting March 5, to reduce stress, but I'm kinda worried it might affect my work, can you help me figure out how to make this work? ->-> 1,9",
      id: 48,
      role: "user",
    },
    {
      content:
        "Glad to hear that the steps are helpful! Handling pushback from colleagues is a common concern when setting new boundaries, but with clear communication and consistency, you can manage it effectively. Here are some tips to help you address potential pushback:\n\n### Handling Pushback from Colleagues\n\n1. **Communicate the Benefits**\n   - **Explain the Purpose**: Clearly explain why you are setting this boundary. Emphasize that it is intended to improve work-life balance and reduce stress, which ultimately benefits everyone by ensuring you are more focused and productive during work hours.\n   - **Share Positive Outcomes**: If possible, share positive outcomes from others who have implemented similar boundaries.\n\n2. **Be Firm but Respectful**\n   - **Reiterate the Boundary**: When someone sends an email or reaches out after 7 PM, gently remind them of your boundary. Be firm but respectful in your response.\n   - **Example Response**: \"Thank you for reaching out. I am not checking emails after 7 PM to maintain a healthy work-life balance. I will respond to your email first thing tomorrow morning. If this is an urgent matter, please use the alternative contact method provided.\"\n\n3. **Provide Alternative Solutions**\n   - **Urgent Contact Method**: Ensure that your team knows how to reach you in case of emergencies. Provide a clear and reliable alternative contact method.\n   - **Delegate Responsibilities**: If appropriate, delegate responsibilities to other team members who can handle urgent matters outside of your working hours.\n\n4. **Set Clear Expectations**\n   - **Define Urgent Matters**: Clearly define what constitutes an urgent matter that requires immediate attention. This helps prevent unnecessary interruptions.\n   - **Establish Protocols**: Establish protocols for handling urgent matters, including who to contact and how to escalate issues.\n\n5. **Regular Check-ins**\n   - **Feedback Sessions**: Schedule regular check-ins with your team to gather feedback and address any concerns. This shows that you are open to dialogue and willing to make adjustments if needed.\n   - **Adjust as Needed**: Be open to making small adjustments if certain aspects of the boundary are causing issues. Flexibility can help maintain good relationships.\n\n6. **Lead by Example**\n   - **Model Behavior**: If you are in a leadership position, model the behavior you expect from your team. This can encourage others to adopt similar boundaries.\n   - **Support Team Members**: Encourage and support your team members in setting their own boundaries. This can create a culture of respect for work-life balance.\n\n### Example Responses to Pushback\n\n**Scenario 1: Colleague Sends an Email After 7 PM**\n\n**Colleague**: \"Hey, I just realized I forgot to send you this report. Can you take a look now?\"\n\n**You**: \"Thank you for sending the report. I am not checking emails after 7 PM to maintain a healthy work-life balance. I will review it first thing tomorrow morning. If this is an urgent matter, please use the alternative contact method provided.\"\n\n**Scenario 2: Colleague Reaches Out via Phone**\n\n**Colleague**: \"This is urgent. Can you check this right away?\"\n\n**You**: \"I appreciate your urgency. Please use the alternative contact method provided for urgent matters. I will be available again tomorrow morning at 9 AM.\"\n\n### Additional Tips\n\n- **Document the Policy**: Consider documenting the new boundary policy in a shared document or company handbook to ensure everyone is aware of the guidelines.\n- **Training and Support**: If applicable, provide training or support to help your team adjust to the new boundaries. This can include workshops on time management and work-life balance.\n\nBy following these steps, you can effectively handle pushback and maintain your new boundary. Remember, consistency and clear communication are key to establishing and maintaining healthy work-life boundaries. How do you feel about these strategies, and is there anything else you think you might need more support with?",
      id: 51,
      role: "assistant",
    },
    {
      content:
        "Thanks! These tips are really helpful. I'll make sure to communicate clearly with my team and be consistent with my new boundary. I'm a bit nervous, but I think being upfront about the benefits and providing alternative solutions will help. I'll also keep an eye on how things go and be ready to adjust if needed.",
      id: 52,
      role: "user",
    },
    {
      content:
        "I've set clear work-free Sundays starting May 5 after David expressed concern, but I'm not sure if that's enough to improve my relationship boundaries, and I'd love some advice on how to maintain them ->-> 3,11",
      id: 216,
      role: "user",
    },
    {
      content:
        "I'm trying to set a firm boundary by not checking work emails after 7 PM, starting July 1, and I've already communicated this to all team members, so how can I ensure everyone respects this new policy ->-> 4,12",
      id: 278,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "work-boundary-order-reasoning",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Work-Life Balance",
        id: 23,
        subtopics: [
          "Setting work boundaries",
          "Reducing stress",
          "Maintaining relationships",
          "Email and weekend habits",
        ],
        theme:
          "Establishing and sustaining healthy work-life boundaries",
        title:
          "Building Better Work-Life Boundaries",
      },
      narratives: "Work boundary order reasoning",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "You decided to start setting email boundaries after 7 PM first, before establishing work-free Sundays.",
            question:
              "Between setting email boundaries after 7 PM and establishing work-free Sundays, which boundary did I decide to start first?",
            question_id: "work-boundary-order-reasoning",
            question_type: "multi_session_reasoning",
            source_chat_ids: [48, 216],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Professional setting work-life boundaries",
        user_relationships: "David",
      },
      user_questions: [],
    },
  ];
}

function buildWillAttorneyMeetingContradictionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've got a meeting with attorney Stephanie on March 22 to finalize my will, and I know Montserrat law requires two witnesses for it to be valid, so I'm hoping she can guide me through the process ->-> 1,12",
      id: 34,
      role: "user",
    },
    {
      content:
        "I've never met attorney Stephanie, which is kinda weird since I'm trying to plan my will, but anyway, can you help me find a good attorney for estate planning ->-> 1,23",
      id: 64,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the two-witness rule for my will, so I was wondering if attorney Stephanie's review on May 1 confirms that I've met all the requirements for a valid will in Montserrat ->-> 2,6",
      id: 84,
      role: "user",
    },
    {
      content:
        "I've never used WillMaker Pro or any digital software to draft my will, which seems weird since I've been working on my estate plan, so can you guide me on how to get started with creating a digital will, given that I've already consulted with attorney Stephanie and accounted for Montserrat's two-witness rule? ->-> 3,23",
      id: 204,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "will-attorney-meeting-contradiction",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Estate Planning",
        id: 24,
        subtopics: [
          "Will finalization",
          "Attorney consultations",
          "Witness requirements",
          "Estate documentation",
        ],
        theme:
          "Preparing an estate plan and consulting an attorney",
        title:
          "Finalizing a Will with Legal Guidance",
      },
      narratives: "Will attorney meeting contradiction",
      probing_questions: {
        contradiction_resolution: [
          {
            answer: "It depends",
            question:
              "Have I met attorney Stephanie to discuss my will?",
            question_id: "will-attorney-meeting-contradiction",
            question_type: "contradiction_resolution",
            source_chat_ids: {"first_statement":[34],"second_statement":[64]},
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Individual finalizing a will",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildLegalTermsExplanationInstructionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've got a tight deadline for this $50,000 film pitch on April 10, and balancing that with creating a legally valid will is challenging, but I need to prioritize and make sure everything is in order ->-> 1,20",
      id: 54,
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
        "Always include software version details when I ask about digital asset management tools. ->-> 2,23",
      id: 128,
      role: "user",
    },
    {
      content:
        "Always verify beneficiary percentages add up to 100% when I ask about inheritance allocations. ->-> 3,22",
      id: 202,
      role: "user",
    },
    {
      content:
        "Always confirm attorney names and credentials when I ask about legal representation. ->-> 4,22",
      id: 270,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "legal-terms-explanation-instruction",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Estate Planning",
        id: 24,
        subtopics: [
          "Will requirements",
          "Legal terminology",
          "Beneficiary allocation",
          "Estate documentation",
        ],
        theme:
          "Preparing a legally valid will with clear guidance",
        title:
          "Understanding Will Requirements",
      },
      narratives: "Legal terms explanation standing instruction",
      probing_questions: {
        instruction_following: [
          {
            answer:
              "Response should explain the legal terms involved in making the will valid.",
            question:
              "What do I need to include to make sure my wishes are legally valid?",
            question_id: "legal-terms-explanation-instruction",
            question_type: "instruction_following",
            source_chat_ids: [62],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Individual preparing a legally valid will",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildPatentTimelinesInstructionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Always provide detailed timelines when I ask about patent application processes. ->-> 1,22",
      id: 66,
      role: "user",
    },
    {
      content:
        "Always include specific dates when I ask about scheduling or deadlines. ->-> 2,23",
      id: 118,
      role: "user",
    },
    {
      content:
        "hmm, what if I need to work on the patent application on Sundays occasionally? ->-> 3,21",
      id: 174,
      role: "user",
    },
    {
      content:
        "Always confirm exact dates when I ask about deadlines or meetings. ->-> 3,22",
      id: 180,
      role: "user",
    },
    {
      content:
        "Always provide clear summaries when I ask about patent drafting progress. ->-> 4,23",
      id: 302,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "patent-timelines-instruction",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Intellectual Property",
        id: 25,
        subtopics: [
          "Patent application steps",
          "Filing timelines",
          "USPTO process",
          "Prior art search",
        ],
        theme:
          "Navigating the patent application process with clear timelines",
        title:
          "Getting a Patent Approved",
      },
      narratives: "Patent timelines standing instruction",
      probing_questions: {
        instruction_following: [
          {
            answer:
              "Response should lay out the patent application steps with a detailed timeline.",
            question:
              "What steps do I need to go through to get a patent approved?",
            question_id: "patent-timelines-instruction",
            question_type: "instruction_following",
            source_chat_ids: [66],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Inventor pursuing a patent",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildNonProvisionalFilingInstructionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've been thinking about my decision to file a provisional patent by May 15, 2024, to secure a priority date before the product launch, and I'm hoping that with the USPTO, my receipt number 12345678 will help me keep track of the progress, can you help me understand what's next in this process? ->-> 3,1",
      id: 124,
      role: "user",
    },
    {
      content:
        "Always confirm exact dates when I ask about deadlines or meetings. ->-> 3,22",
      id: 180,
      role: "user",
    },
    {
      content:
        "Got it! Thanks for laying out the timeline and key dates. Just to confirm:\n\n- **Non-Provisional Patent Filing Deadline**: November 10, 2024.\n- **Budget Allocation Period**: July 1 - August 31, 2024.\n- **Enhancements Timeline**:\n  - **July 15 - July 31, 2024**: AI tagging accuracy and performance optimization.\n  - **August 1 - August 15, 2024**: Bug fixes and testing.\n  - **August 16 - August 31, 2024**: Data encryption and secure authentication.\n  - **September 1 - September 15, 2024**: Cross-platform compatibility and integration.\n  - **September 16 - September 30, 2024**: Documentation and customer support.\n  - **October 1 - October 15, 2024**: Final testing and validation.\n  - **October 16 - October 31, 2024**: Market launch preparation.\n\nThis looks good. I'll make sure to stick to these dates to keep everything on track.",
      id: 182,
      role: "user",
    },
    {
      content:
        "Always provide clear summaries when I ask about patent drafting progress. ->-> 4,23",
      id: 302,
      role: "user",
    },
    {
      content:
        "I've already registered the trademark for VidTag Pro on November 18, 2024, but I'm not sure how this will impact my negotiations with potential partners, can you help me understand the implications of this registration on my partnership with Caribbean Tech Distributors ->-> 5,7",
      id: 322,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "non-provisional-filing-instruction",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Intellectual Property",
        id: 25,
        subtopics: [
          "Patent filing deadlines",
          "Exact date confirmation",
          "Budget allocation",
          "Enhancements timeline",
        ],
        theme:
          "Tracking exact patent deadlines and key dates",
        title:
          "Confirming Patent Filing Dates",
      },
      narratives: "Non-provisional patent filing date standing instruction",
      probing_questions: {
        instruction_following: [
          {
            answer:
              "Response should state the exact non-provisional patent filing date of November 10, 2024.",
            question:
              "When is the non-provisional patent filing scheduled?",
            question_id: "non-provisional-filing-instruction",
            question_type: "instruction_following",
            source_chat_ids: [180, 182],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Inventor tracking exact patent deadlines",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildCareerRelocationEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried that my $12.99/month Canva Pro subscription might not be enough to make my resume ATS compatible by March 30, 2024, can you help me with that? ->-> 1,9",
      id: 18,
      role: "user",
    },
    {
      content:
        "I'm kinda stuck on this LinkedIn Learning course, I've only completed 40% of it by March 15, 2024, and I'm not sure if I'll be able to optimize my resume for ATS by the time I'm done ->-> 1,11",
      id: 22,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to use specific software to test my resume with ATS simulators?",
      id: 44,
      role: "user",
    },
    {
      content:
        "I started using Jobscan to compare my resume against 5 job descriptions and I improved my keyword match by 25%, but I'm not sure what to do next to get my resume to pass any Applicant Tracking System ->-> 2,4",
      id: 56,
      role: "user",
    },
    {
      content:
        "I updated my LinkedIn headline to “Executive Producer | Digital Storytelling | Caribbean Media Innovator” on July 5, 2024, will this help me stand out to potential employers and get more profile views ->-> 3,3",
      id: 108,
      role: "user",
    },
    {
      content:
        "I'm kinda stressed about my panel interview for the consulting role on September 20, 2024, in Toronto via Zoom at 3 PM AST, and I was wondering if you could help me prepare ->-> 4,13",
      id: 176,
      role: "user",
    },
    {
      content:
        "I'm trying to manage my relocation logistics and career decisions effectively, but I'm not sure how my calm and logical approach will help with the short-term rental options in London's Shoreditch area, which are averaging £1,800/month for the initial 3 months ->-> 5,19",
      id: 242,
      role: "user",
    },
    {
      content:
        "How can I use my calm and logical approach to research and decide on the best short-term rental option in London's Shoreditch area, considering the average cost of £1,800/month for the initial 3 months, to ensure a smooth relocation ->-> 5,20",
      id: 244,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "career-relocation-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Career Development",
        id: 22,
        subtopics: [
          "Resume and ATS optimization",
          "Professional branding",
          "Interview preparation",
          "Relocation planning",
        ],
        theme:
          "Advancing a career and planning an international relocation",
        title:
          "Career Development and Relocation Planning",
      },
      narratives: "Career development and relocation event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: making the resume ATS compatible with Canva Pro, improving keyword match with Jobscan, updating the LinkedIn headline, preparing for the panel interview, and researching the Shoreditch short-term rental for relocation.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different aspects of my career development and relocation plans in our conversations, in order? Mention ONLY and ONLY five items.",
            question_id: "career-relocation-event-order",
            question_type: "event_ordering",
            source_chat_ids: [18, 56, 108, 176, 244],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Professional planning career growth and relocation",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildAiHiringEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've been working with Michael, 28, a junior editor, at Montserrat Media Hub since we met on January 10, 2023, and I'm not sure if AI can replace the human touch he brings to our weekly collaborations on editing timelines ->-> 1,5",
      id: 24,
      role: "user",
    },
    {
      content:
        "hmm, what specific steps can I take to ensure the AI doesn't overlook candidates with strong soft skills?",
      id: 26,
      role: "user",
    },
    {
      content:
        "Ensuring that the AI doesn't overlook candidates with strong soft skills is crucial, especially in roles where interpersonal skills and cultural fit are important. Here are some specific steps you can take to balance the use of AI with the need to assess soft skills:\n\n### Steps to Ensure Soft Skills Are Not Overlooked\n\n1. **Define Comprehensive Evaluation Criteria**:\n   - **Technical Skills**: Use AI to screen for technical skills and basic qualifications.\n   - **Soft Skills**: Define specific soft skills you want to assess, such as communication, teamwork, problem-solving, and adaptability.\n\n2. **Use Multi-Stage Evaluation**:\n   - **Initial Screening**: Use AI for the initial screening of resumes and basic qualifications.\n   - **Structured Interviews**: Implement structured interviews conducted by human evaluators to assess soft skills.\n   - **Behavioral Questions**: Use behavioral interview questions that require candidates to describe past experiences and actions, which can reveal their soft skills.\n\n3. **Assessment Tools**:\n   - **Psychometric Tests**: Incorporate psychometric tests that evaluate personality traits and soft skills. These can be integrated into the AI system or conducted separately.\n   - **Scenario-Based Assessments**: Use scenario-based assessments where candidates are asked to solve hypothetical problems or interact with simulated situations.\n\n4. **Human-led Follow-Up**:\n   - **Final Interviews**: Ensure that human evaluators conduct final interviews to assess cultural fit and interpersonal skills.\n   - **Panel Interviews**: Use panel interviews involving multiple team members to get a broader perspective on the candidate's soft skills.\n\n5. **Feedback Mechanisms**:\n   - **Candidate Feedback**: Collect feedback from candidates about their experience with the AI screening process to identify any issues or biases.\n   - **Team Feedback**: Gather feedback from your team on the candidates who pass the initial AI screening to ensure they meet the soft skill criteria.\n\n6. **Regular Audits**:\n   - **Bias Audits**: Regularly audit the AI system to ensure it is not inadvertently overlooking candidates with strong soft skills.\n   - **Performance Reviews**: Conduct regular reviews of the performance of newly hired candidates to assess whether the AI and human evaluation processes are effective.\n\n### Implementation in the Pilot Program\n\n1. **Define Objectives**:\n   - **Time Reduction**: Aim to reduce the time spent on resume screening by at least 50%.\n   - **Diversity**: Monitor the diversity of the candidate pool.\n   - **Quality of Talent**: Assess the quality and fit of the candidates selected.\n   - **Soft Skills**: Ensure that candidates with strong soft skills are not overlooked.\n\n2. **Select Positions for the Pilot**:\n   - Choose a couple of positions that are representative of your typical hiring needs, such as junior editors or assistant producers.\n\n3. **Choose an AI Tool**:\n   - Select an AI hiring tool that aligns with your objectives. Some recommended tools include Unitive, Applied, or HireVue.\n   - Ensure the tool offers a trial period or pilot program.\n\n4. **Configure the AI Tool**:\n   - Work closely with the tool provider to configure the system according to your needs.\n   - Set up anonymization settings to remove personal identifiers from resumes.\n   - Define evaluation criteria that include both technical skills and soft skills.\n\n5. **Train Your Team**:\n   - Conduct training sessions for your HR team and hiring managers on how to use the AI tool effectively.\n   - Ensure everyone understands the importance of maintaining fairness and transparency.\n   - Train on how to conduct structured interviews and assess soft skills.\n\n6. **Launch the Pilot**:\n   - Start the pilot for the selected positions.\n   - Monitor the process closely to ensure it is operating as intended.\n   - Keep detailed records of the time spent on each stage of the hiring process before and after implementing the AI tool.\n\n7. **Collect Data and Feedback**:\n   - Track the time saved during the resume screening process.\n   - Gather data on the diversity of the candidate pool, such as gender, ethnicity, and age.\n   - Collect feedback from your team and candidates about their experiences with the AI tool.\n\n8. **Evaluate Results**:\n   - After the pilot period, review the data and feedback collected.\n   - Analyze whether the time reduction and diversity objectives were met.\n   - Assess the quality of candidates selected and their soft skills.\n   - Observe how new hires integrate into the team and contribute to project success.\n\n9. **Make Adjustments**:\n   - Based on the evaluation, make any necessary adjustments to the AI tool configuration or process.\n   - Address any concerns or issues identified during the pilot.\n\n10. **Document Findings**:\n    - Prepare a comprehensive report summarizing the findings of the pilot.\n    - Include data on time savings, diversity metrics, and quality of candidates.\n    - Highlight any lessons learned and recommendations for future use.\n\n### Example Workflow\n\n1. **Initial Screening**:\n   - AI screens resumes and shortlists candidates based on technical skills and basic qualifications.\n   - Human evaluators review the shortlisted candidates and conduct initial interviews.\n\n2. **Structured Interviews**:\n   - Human-led structured interviews to assess soft skills using behavioral questions.\n   - Panel interviews involving multiple team members to get a broader perspective.\n\n3. **Final Decisions**:\n   - Human evaluators make final hiring decisions based on a combination of AI screening results and human assessments of soft skills.\n\nBy following these steps, you can ensure that the AI system complements your efforts to assess and value soft skills, while also streamlining the hiring process. This balanced approach will help you maintain the human touch and collaborative dynamics that are essential to your team's success.\n\nWould you like to discuss any specific aspect of these steps in more detail?",
      id: 27,
      role: "assistant",
    },
    {
      content:
        "hmm, what specific psychometric tests do you recommend integrating into the AI system?",
      id: 28,
      role: "user",
    },
    {
      content:
        "I'm looking to save some costs, and I heard AI hiring tools can cost between $5,000 and $12,000 annually, which is way less than our current manual hiring costs of $15,000 per hire, so is it a good idea to switch to AI hiring tools to reduce our expenses? ->-> 1,12",
      id: 44,
      role: "user",
    },
    {
      content:
        "I'm considering using AI to automate hiring in my company, and I've already completed 2 AI-assisted candidate screenings using HireVue between April 10-25, which reduced screening time by 45%, so what are the next steps to ensure this process complies with Montserrat's 2022 privacy law, especially since I've ensured candidate data is encrypted with AES-256 during AI processing? ->-> 2,2",
      id: 94,
      role: "user",
    },
    {
      content:
        "Michael suggested integrating Pymetrics for soft skills assessment, which improved candidate fit by 20% in April hires, and I'm kinda curious to know if this could be the key to making our hiring process more efficient ->-> 2,7",
      id: 106,
      role: "user",
    },
    {
      content:
        "Integrating Pymetrics for soft skills assessment is an intriguing idea, especially given the 20% improvement in candidate fit that you observed in April hires. Let's delve into how this could enhance the efficiency and effectiveness of your hiring process.\n\n### Benefits of Integrating Pymetrics\n\n1. **Improved Candidate Fit**:\n   - **Soft Skills Assessment**: Pymetrics evaluates candidates based on cognitive and emotional traits, which are crucial for job fit but often difficult to assess through traditional methods.\n   - **Better Team Integration**: Candidates who score higher on soft skills assessments are more likely to integrate well into the team, leading to better collaboration and productivity.\n\n2. **Efficiency Gains**:\n   - **Reduced Interview Rounds**: With more accurate assessments upfront, you can reduce the number of interview rounds needed, saving time and resources.\n   - **Faster Hiring Cycles**: By quickly identifying top candidates, you can shorten the overall hiring timeline, which is particularly beneficial in competitive talent markets.\n\n3. **Data-Driven Decisions**:\n   - **Objective Evaluation**: Pymetrics provides objective data on candidate fit, reducing the risk of subjective biases that can affect hiring decisions.\n   - **Performance Predictions**: Historical data from Pymetrics can help predict future performance, allowing you to make more informed hiring choices.\n\n### Potential Challenges\n\n1. **Bias and Fairness**:\n   - **Algorithmic Bias**: Ensure that the Pymetrics algorithms are regularly audited to prevent any unintended biases based on demographic factors.\n   - **Transparency**: Maintain transparency with candidates about how their data is used and the basis for hiring decisions.\n\n2. **Candidate Experience**:\n   - **User-Friendliness**: Ensure that the assessment process is user-friendly and does not deter candidates due to complexity or length.\n   - **Feedback Mechanism**: Provide candidates with feedback on their assessments to enhance their experience and build trust.\n\n3. **Integration and Training**:\n   - **System Integration**: Smooth integration with existing HR systems and workflows is crucial to avoid disruptions.\n   - **Training**: Proper training for HR and hiring managers on how to interpret and use the data effectively.\n\n### Steps to Implement Pymetrics\n\n1. **Pilot Program**:\n   - **Select a Subset**: Start with a pilot program for a subset of positions to evaluate the effectiveness and gather data.\n   - **Monitor Outcomes**: Track key metrics such as time-to-hire, candidate quality, and team integration to assess the impact.\n\n2. **Audit and Adjust**:\n   - **Regular Audits**: Conduct regular audits of the Pymetrics algorithms to ensure fairness and accuracy.\n   - **Feedback Loop**: Establish a feedback loop with candidates and hiring managers to continuously improve the process.\n\n3. **Expand Gradually**:\n   - **Scale Up**: Based on the success of the pilot, gradually expand the use of Pymetrics to more positions and departments.\n   - **Refine Processes**: Continuously refine the hiring processes based on feedback and data insights.\n\n### Conclusion\n\nIntegrating Pymetrics for soft skills assessment can indeed be a key factor in making your hiring process more efficient and effective. The 20% improvement in candidate fit is a strong indicator that this tool can add significant value. By carefully planning the implementation, monitoring outcomes, and addressing potential challenges, you can leverage Pymetrics to enhance the overall quality of your hiring process.\n\nWould you like to explore any specific aspects of implementing Pymetrics further, such as detailed pilot plans or strategies for addressing potential biases?",
      id: 107,
      role: "assistant",
    },
    {
      content:
        "Yeah, I think integrating Pymetrics could definitely help us. The 20% improvement in candidate fit is pretty compelling. Let's start with a pilot program for a few positions and see how it goes. We should also make sure to keep an eye on any potential biases and maintain transparency with the candidates.",
      id: 108,
      role: "user",
    },
    {
      content:
        "I've been working with Jessica, who helped draft candidate communication templates on April 27, and I'm wondering if she can also help me improve the tone of these emails to make them more personal? ->-> 2,15",
      id: 134,
      role: "user",
    },
    {
      content:
        "What's the best way to ensure the AI screening tool's 90% accuracy doesn't introduce bias into my hiring process, especially considering I've never implemented two-factor authentication for any platform access? ->-> 2,22",
      id: 170,
      role: "user",
    },
    {
      content:
        "I'm considering using AI to automate hiring, but I want to make sure it's fair, especially since Michael revealed he's developing AI fairness metrics on July 12 during lunch at The Green Turtle ->-> 3,4",
      id: 192,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "ai-hiring-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Human Resources",
        id: 23,
        subtopics: [
          "AI in recruitment",
          "Soft skills assessment",
          "Psychometric testing",
          "AI fairness",
        ],
        theme:
          "Integrating AI into the hiring process responsibly",
        title:
          "Using AI in Hiring",
      },
      narratives: "AI in hiring process event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: questioning whether AI can replace the human touch, ensuring AI does not overlook soft skills, choosing psychometric tests, introducing Pymetrics for soft skills, piloting Pymetrics, and adding AI fairness metrics.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different aspects of using AI in our hiring process across our conversations, in order? Mention ONLY and ONLY six items.",
            question_id: "ai-hiring-event-order",
            question_type: "event_ordering",
            source_chat_ids: [24, 26, 28, 106, 108, 192],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Hiring manager exploring AI tools",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildPatentFundingEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I aim to file a provisional patent by June 1, 2024, but I'm not sure what steps to take next, can you guide me through the process and help me achieve my goal? ->-> 1,8",
      id: 30,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that my prior art search, which I plan to complete by April 10, 2024, using the USPTO database and Google Patents, might not be thorough enough, can you help me make sure I'm covering all bases? ->-> 1,9",
      id: 32,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the technical specs of my device, like the AI model version 2.3, 16GB RAM, and 256GB SSD storage, will they be enough to make my patent application strong? ->-> 2,16",
      id: 104,
      role: "user",
    },
    {
      content:
        "I've never attended any patent-related webinars or workshops, which is weird because I registered for a patent law webinar on April 5, 2024, can you guide me on what to expect and how it can help my invention? ->-> 2,24",
      id: 120,
      role: "user",
    },
    {
      content:
        "I've got a deadline to meet for my non-provisional patent filing, which is set for November 10, 2024, and I'm hoping to get some guidance on how to move forward with the process ->-> 3,18",
      id: 164,
      role: "user",
    },
    {
      content:
        "I've decided to file a PCT application on October 20, 2024, covering the US, Canada, and EU markets, can you help me understand what that entails and if I'm making the right decision with this strategy? ->-> 4,5",
      id: 200,
      role: "user",
    },
    {
      content:
        "Yeah, filing the PCT application sounds like a good move. It gives us the flexibility to decide later which countries to enter. I just need to figure out how to cover the extra costs. Any ideas on how to get some additional funding?",
      id: 202,
      role: "user",
    },
    {
      content:
        "hmm, which funding option do you think would be quickest to secure the extra funds we need?",
      id: 204,
      role: "user",
    },
    {
      content:
        "hmm, which crowdfunding platform do you think would be best for my invention?",
      id: 206,
      role: "user",
    },
    {
      content:
        "Given that I've never registered any trademarks or intellectual property rights for my invention, how should I proceed with protecting my invention while also preparing for the prototype testing scheduled to complete 15 cycles by September 30, 2024, aiming for 98% accuracy, and considering my decision to file a PCT application on October 20, 2024, covering US, Canada, and EU markets? ->-> 5,24",
      id: 370,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "patent-funding-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Intellectual Property",
        id: 25,
        subtopics: [
          "Provisional and non-provisional filing",
          "PCT applications",
          "Funding options",
          "Crowdfunding",
        ],
        theme:
          "Planning patent filings and securing funding",
        title:
          "Patent Filing and Funding Plans",
      },
      narratives: "Patent filing and funding event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: planning the provisional patent filing, the non-provisional filing deadline, deciding on the PCT application, seeking funding for the PCT costs, choosing the quickest funding option, and selecting a crowdfunding platform.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different aspects of my patent filing plans and related funding discussions across our conversations in order? Mention ONLY and ONLY six items.",
            question_id: "patent-funding-event-order",
            question_type: "event_ordering",
            source_chat_ids: [30, 164, 200, 202, 204, 206],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Inventor planning patent filings and funding",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildCombinatoricsProbabilityEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to understand the difference between independent and mutually exclusive events, can you help me with that, like what's an example of each, maybe something with coin tosses or dice rolls, I want to see the probability calculations for both cases, so I can clarify the concepts in my head ->-> 1,5",
      id: 14,
      role: "user",
    },
    {
      content:
        "I'm trying to decide where to start with probability, and I've got two options - coin toss problems where the probability of getting heads is 1/2, or dice roll problems where the probability of rolling a 4 is 1/6, so should I start with coin toss problems or dice roll problems to get a better understanding of probability basics, like how to calculate the probability of an event as a ratio of favorable outcomes to total outcomes, and how to differentiate between independent and mutually exclusive events, which seems crucial for my practical and intellectual growth as a 44-year-old colour technologist from Port Michael ->-> 1,6",
      id: 16,
      role: "user",
    },
    {
      content:
        "I'm trying to understand the concept of permutations and combinations, specifically with 3 objects, and I see that 3! equals 6, which represents the number of ways to arrange these objects, and 3C2 equals 3, which is the number of ways to choose 2 objects out of 3 without considering the order, so can you help me solve a problem where I have 3 different colored balls, and I want to find the number of ways to arrange them in a row, and also the number of ways to choose 2 balls out of the 3, considering that the order doesn't matter in the second case? ->-> 1,10",
      id: 28,
      role: "user",
    },
    {
      content:
        "I'm trying to understand if the events \"rolling a 2\" and \"rolling a 5\" on a die are mutually exclusive, which means P(A ∩ B) = 0, and I want to confirm this concept ->-> 1,17",
      id: 42,
      role: "user",
    },
    {
      content:
        "I'm trying to understand probability as a ratio, and I prefer step-by-step explanations with concrete examples like coin tosses and dice rolls to grasp probability fundamentals, so can you help me calculate the probability of rolling an even number on a 6-sided die, considering that there are 3 even numbers out of 6 possible outcomes, considering my goal is to solve 10 probability problems involving single events with at least 80% accuracy by February 1, and I've already completed 5 coin toss problems with 80% mastery of simple probability ratios? ->-> 1,25",
      id: 60,
      role: "user",
    },
    {
      content:
        "I'm trying to calculate the probability of drawing 2 aces together from a deck of 52 cards, and I came across this formula: 4C2 / 52C2 = 6/1326 ≈ 0.00452, can you help me understand how this works and what it means for my chances of getting two aces in a row? ->-> 2,6",
      id: 76,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "combinatorics-probability-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Mathematics",
        id: 18,
        subtopics: [
          "Permutations and combinations",
          "Probability basics",
          "Counting principles",
          "Card probability",
        ],
        theme:
          "Working through combinatorics and probability problems",
        title:
          "Combinatorics and Probability Concepts",
      },
      narratives: "Combinatorics and probability event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: working through permutations and combinations with three objects, then calculating the probability of drawing two aces from a deck.",
            ordering_type: "mention_sequence",
            question:
              "Can you list the order in which I brought up different aspects of combinatorial calculations and probability concepts throughout our conversations in order? Mention ONLY and ONLY five items.",
            question_id: "combinatorics-probability-event-order",
            question_type: "event_ordering",
            source_chat_ids: [28, 76],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Student studying combinatorics and probability",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildSneakerSafetyEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've got a budget limit of $200 for sneakers and I'm deciding between Adidas Ultraboost and Nike React Infinity Run, which one would you recommend for daily wear considering my budget cap? ->-> 1,12",
      id: 38,
      role: "user",
    },
    {
      content:
        "I'm considering sneakers with good breathability, like the Ultraboost that uses Primeknit, but I also need medium arch support due to my mild flat feet - can you help me find a balance between these features? ->-> 1,13",
      id: 40,
      role: "user",
    },
    {
      content:
        "I'm concerned about injury risk on uneven terrain at filming sites, so I need good grip soles, can you help me find sneakers that fit that requirement, maybe something with a medium arch support ->-> 1,20",
      id: 54,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that my new Ultraboost sneakers might not be the right fit, so I'm glad Finish Line has a 30-day return policy, right? ->-> 2,6",
      id: 74,
      role: "user",
    },
    {
      content:
        "The Continental rubber outsole on my new Ultraboost sneakers offers 30% better traction on wet surfaces, which is a big safety feature for me, do you think this is a good enough reason to choose them over other sneakers? ->-> 2,14",
      id: 94,
      role: "user",
    },
    {
      content:
        "I've been having issues with shin splints, and I'm considering switching to Brooks Ghost for running after May 5, like I did to avoid injury risk, was that a good decision? ->-> 3,13",
      id: 138,
      role: "user",
    },
    {
      content:
        "I just got a New Balance 990v5 with reflective panels that improve night visibility by 40%, is this a good feature for daily wear considering safety? ->-> 4,11",
      id: 184,
      role: "user",
    },
    {
      content:
        "I've decided to wear my Nike Dunk Low with orthotic insoles to the festival to prevent arch strain, and I'm kinda excited to see how they'll perform, can you help me understand how the orthotic insoles will work with the Zoom Air unit to provide better responsiveness? ->-> 5,22",
      id: 262,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "sneaker-safety-event-order",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Asking Recommendation",
        id: 20,
        subtopics: [
          "Grip and traction",
          "Injury prevention",
          "Visibility and safety",
          "Orthotic support",
        ],
        theme:
          "Choosing sneakers with safety and comfort features",
        title:
          "Sneaker Safety and Comfort Features",
      },
      narratives: "Sneaker safety and comfort feature event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: grip soles for uneven terrain, Continental rubber traction, switching to Brooks Ghost for shin splints, reflective panels for night visibility, and orthotic insoles for arch strain.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different safety and comfort features of my sneakers during our chats, in order? Mention ONLY and ONLY five items.",
            question_id: "sneaker-safety-event-order",
            question_type: "event_ordering",
            source_chat_ids: [54, 94, 138, 184, 262],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Shopper choosing sneakers for safety and comfort",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildPatentProcessStagesEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried that my prior art search, which I plan to complete by April 10, 2024, using the USPTO database and Google Patents, might not be thorough enough, can you help me make sure I'm covering all bases? ->-> 1,9",
      id: 32,
      role: "user",
    },
    {
      content:
        "I'm aiming to secure patent approval within 18 months after filing the non-provisional application, but I'm not sure if that's a realistic target, can you give me some guidance on what to expect from the patent application process? ->-> 1,10",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the prior art search I completed on April 10, 2024, which found 3 similar patents but none with AI tagging features, so can you help me understand how this affects my decision to file a provisional patent by May 15, 2024? ->-> 2,2",
      id: 70,
      role: "user",
    },
    {
      content:
        "I've completed 5 cycles of prototype testing by April 30, 2024, with 92% accuracy in AI tagging, can you help me understand how this progress affects my decision to file a provisional patent first? ->-> 2,7",
      id: 82,
      role: "user",
    },
    {
      content:
        "I'm kinda worried about the provisional patent I filed on May 15, 2024, with the receipt number 12345678, and I was wondering if I should be doing anything now that it's July 10, 2024, to make sure everything is on track for the non-provisional patent ->-> 3,2",
      id: 122,
      role: "user",
    },
    {
      content:
        "I'm working with Ashlee to draft a non-provisional patent application that we started on September 1, 2024, and I met her at her office on September 10 to review the 45-page draft including 12 drawings, so what's the best way to ensure we meet the November deadline? ->-> 4,2",
      id: 188,
      role: "user",
    },
    {
      content:
        "Thanks for the detailed steps! I think setting clear milestones and prioritizing tasks will really help. The main thing I'm worried about is making sure everything is clear and consistent during the review and revision phase. Could you give me some tips on how to approach that effectively?",
      id: 190,
      role: "user",
    },
    {
      content:
        "Thanks for the detailed plan! I think setting clear milestones and prioritizing tasks will really help. The main thing I'm worried about is making sure everything is clear and consistent during the review and revision phase. Could you give me some tips on how to approach that effectively?",
      id: 194,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "patent-process-stages-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Intellectual Property",
        id: 25,
        subtopics: [
          "Prior art search",
          "Provisional filing",
          "Non-provisional drafting",
          "Review milestones",
        ],
        theme:
          "Walking through the stages of the patent process",
        title:
          "Patent Process Stages",
      },
      narratives: "Patent process stages event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "The sequence was: planning the prior art search, completing it, filing the provisional patent, drafting the non-provisional application, and setting review milestones.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up the different stages of my patent process throughout our conversations, in order? Mention ONLY and ONLY five items.",
            question_id: "patent-process-stages-event-order",
            question_type: "event_ordering",
            source_chat_ids: [32, 70, 122, 188, 190],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Inventor working through the patent process",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildAcademicMentorshipEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda worried about meeting my new academic mentor, Robert, who's 75 and a retired professor, at the East Janethaven Library on Feb 10, 2024 - how can I make a good impression on him? ->-> 1,5",
      id: 14,
      role: "user",
    },
    {
      content:
        "I'm kinda worried that I won't be able to improve my essay grades from B- to A by June 15, 2024, so can you help me create a plan to focus on persuasive academic writing? ->-> 1,9",
      id: 24,
      role: "user",
    },
    {
      content:
        "I'm really inspired by Robert's 1985 essay on gender studies that he shared during our April 4 Zoom call, and I'm thinking of using some of those argument angles in my essay, but how can I make sure I'm not copying his ideas? ->-> 2,5",
      id: 64,
      role: "user",
    },
    {
      content:
        "I'm kinda struggling to understand how to apply rhetorical devices and bias from those 5 key articles I finished noting by April 4, can you help me break it down further? ->-> 2,14",
      id: 86,
      role: "user",
    },
    {
      content:
        "I'm finalizing my first draft of the essay by May 15, 2024, and I have 4,500 words to submit, can you help me manage my time effectively to meet this deadline? ->-> 3,2",
      id: 116,
      role: "user",
    },
    {
      content:
        "I'm trying to decide whether to prioritize Robert's recommendation to use stronger warrants for claims on gender bias, which he mentioned when he reviewed my draft on May 9, or to focus on other aspects of my essay ->-> 3,5",
      id: 124,
      role: "user",
    },
    {
      content:
        "I've been experiencing some self-doubt about my argument strength, especially after May 7 when I had doubts, but then I consulted Robert's feedback and it really helped me overcome them, how can I continue to build my confidence in my arguments? ->-> 3,21",
      id: 156,
      role: "user",
    },
    {
      content:
        "I'm trying to decide how to best approach the conference paper on media representation with Greg, and since Robert suggested submitting my essay to a journal, I'm wondering if I should focus on making my essay a stronger, more persuasive piece before working on the conference paper ->-> 4,5",
      id: 170,
      role: "user",
    },
    {
      content:
        "I re-examined 7 feminist critiques on May 29 for a deeper synthesis, and now I'm wondering how to effectively incorporate these new insights into my essay without overwhelming the reader ->-> 4,14",
      id: 190,
      role: "user",
    },
    {
      content:
        "I'm feeling quite confident after getting such a high grade on July 10, but I want to make sure I'm on the right track for our Zoom meeting on July 20, can you help me review my progress and plan for the conference preparation? ->-> 5,3",
      id: 214,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "academic-mentorship-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Education",
        id: 28,
        subtopics: [
          "Meeting the mentor",
          "Essay inspiration",
          "Feedback on warrants",
          "Conference paper",
        ],
        theme:
          "Academic work and mentorship across conversations",
        title:
          "Academic Mentorship",
      },
      narratives: "Academic work and mentorship event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You raised these aspects in this order: meeting your new academic mentor, being inspired by the 1985 essay shared on a Zoom call, considering feedback on stronger warrants, debating the conference paper versus the essay, and feeling confident after a high grade ahead of a follow-up Zoom meeting.",
            ordering_type: "mention_sequence",
            question:
              "Can you list the order in which I brought up different aspects of my academic work and mentorship throughout our conversations in order? Mention ONLY and ONLY five items.",
            question_id: "academic-mentorship-event-order",
            question_type: "event_ordering",
            source_chat_ids: [14, 64, 124, 170, 214],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Graduate student working with an academic mentor",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildMentorInteractionsEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm thinking of attending the March 15 workshop on workflow optimization at East Janethaven Media Center, which Patrick, my 79-year-old senior producer mentor, suggested, but I'm not sure if it's worth taking time off from my current projects ->-> 1,6",
      id: 30,
      role: "user",
    },
    {
      content:
        "I've got a meeting with my mentor Patrick coming up and I want to discuss how to apply the progressive muscle relaxation technique he recommended on April 3 to help me cope with still feeling drained after reducing my work hours to 45 by April 1 ->-> 2,3",
      id: 138,
      role: "user",
    },
    {
      content:
        "Yeah, let's go with those steps. I'll focus on refining my resume and cover letter first, then get feedback from Patrick and Greg. I'll also start preparing for interviews and networking more. Sounds good?",
      id: 186,
      role: "user",
    },
    {
      content:
        "I had a meeting with Patrick on May 15 at Café Montserrat on Main Street where he shared some interview tips, and now I'm wondering if I should also ask him about his experience with stress management in the industry ->-> 3,3",
      id: 196,
      role: "user",
    },
    {
      content:
        "That plan sounds good to me! I'll reach out to Patrick and set up another meeting to talk about stress management. I think his insights could be really helpful as I prepare for the interview.",
      id: 198,
      role: "user",
    },
    {
      content:
        "I just got a call from Patrick congratulating me on my new role and advising on leadership strategies, but I'm not sure how to implement them, can you guide me on how to apply his advice effectively? ->-> 4,3",
      id: 254,
      role: "user",
    },
    {
      content:
        "These steps sound great! I think starting with one-on-one meetings and organizing a team-building event will really help build trust. And the \"flexible Fridays\" idea is perfect for encouraging innovation. I'm excited to implement these and see how the team responds. Let's do it!",
      id: 258,
      role: "user",
    },
    {
      content:
        "I'm looking forward to my monthly mentorship call with Patrick on July 15, can you help me prepare some questions to ask him about leadership advice? ->-> 4,16",
      id: 286,
      role: "user",
    },
    {
      content:
        "I'm three months into my senior producer role and I'm trying to focus on long-term burnout prevention and sustaining motivation, can you help me come up with strategies to achieve this, especially since I had a progress review with Patrick on September 10 ->-> 5,2",
      id: 304,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "mentor-interactions-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Career",
        id: 29,
        subtopics: [
          "Workshop suggestion",
          "Relaxation technique",
          "Interview tips",
          "Leadership advice",
        ],
        theme:
          "Interactions with a senior producer mentor across conversations",
        title:
          "Mentor Interactions",
      },
      narratives: "Mentor interactions event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You raised your mentor interactions in this order: considering the suggested workshop, the recommended relaxation technique, the meeting with interview tips, following up on stress management, receiving leadership advice on your new role, and implementing that advice with the team.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different aspects of my interactions with Patrick throughout our conversations, in order? Mention ONLY and ONLY six items.",
            question_id: "mentor-interactions-event-order",
            question_type: "event_ordering",
            source_chat_ids: [30, 138, 196, 198, 254, 258],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer mentored by a senior colleague",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildHiringAutomationTopicsEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I've got this goal to reduce hiring time by 30% within 6 months, and I'm hoping to achieve it without compromising candidate fairness, so can you help me figure out if AI automation is the way to go, considering I aim to make this change within a specific timeframe ->-> 1,8",
      id: 36,
      role: "user",
    },
    {
      content:
        "I'm looking to save some costs, and I heard AI hiring tools can cost between $5,000 and $12,000 annually, which is way less than our current manual hiring costs of $15,000 per hire, so is it a good idea to switch to AI hiring tools to reduce our expenses? ->-> 1,12",
      id: 44,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to get Jessica involved in the training sessions for the AI tool?",
      id: 46,
      role: "user",
    },
    {
      content:
        "I'm kinda concerned about using AI for hiring, so I prefer a balanced approach, you know, using AI for efficiency but keeping human oversight to ensure fairness, what do you think about that? ->-> 1,17",
      id: 68,
      role: "user",
    },
    {
      content:
        "I'm considering using AI to automate hiring in my company, and I've already completed 2 AI-assisted candidate screenings using HireVue between April 10-25, which reduced screening time by 45%, so what are the next steps to ensure this process complies with Montserrat's 2022 privacy law, especially since I've ensured candidate data is encrypted with AES-256 during AI processing? ->-> 2,2",
      id: 94,
      role: "user",
    },
    {
      content:
        "I'm considering using AI for hiring and I've already seen some promising results, like saving around $4,000 in recruiter hours over 6 weeks with an initial pilot cost of $6,500, so I'm wondering if this is a good return on investment ->-> 2,6",
      id: 104,
      role: "user",
    },
    {
      content:
        "I've saved $9,000 in recruitment costs over 4 months, exceeding initial projections by 18%, and I'm wondering if I should continue to automate hiring in my company to maximize cost savings ->-> 3,7",
      id: 198,
      role: "user",
    },
    {
      content:
        "Ok cool, do I need to involve Linda in every stage of the automation expansion?",
      id: 200,
      role: "user",
    },
    {
      content:
        "I'm trying to decide whether to continue using AI in our hiring process, considering the 25% reduction in hiring-related stress since we started using it, and I'm thinking about Michael's upcoming presentation on AI fairness findings at the Montserrat Tech Summit, but I want to make sure we're not compromising candidate fairness ->-> 3,15",
      id: 226,
      role: "user",
    },
    {
      content:
        "How can I balance the social responsibility of educating local businesses on ethical AI hiring with my own goals, like the one Carla and I discussed after co-hosting the October 1 panel at Montserrat Business Council, which was attended by over 50 professionals? ->-> 4,4",
      id: 274,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "hiring-automation-topics-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Business",
        id: 30,
        subtopics: [
          "Cost comparison",
          "Pilot results",
          "Long-term savings",
          "Team involvement",
        ],
        theme:
          "Cost-saving and involvement topics for hiring automation",
        title:
          "Hiring Automation Topics",
      },
      narratives: "Hiring automation cost and involvement event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You raised these topics in this order: the cost comparison between AI tools and manual hiring, the initial pilot results, the longer-term recruitment savings, whether to involve a colleague in the training sessions, and whether to involve another colleague in the automation expansion.",
            ordering_type: "mention_sequence",
            question:
              "Can you walk me through the order in which I brought up different cost-saving and involvement topics related to hiring automation across our conversations in order? Mention ONLY and ONLY five items.",
            question_id: "hiring-automation-topics-event-order",
            question_type: "event_ordering",
            source_chat_ids: [44, 104, 198, 46, 200],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Manager evaluating AI hiring automation",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildCityAutocompleteEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to implement city autocomplete using OpenWeather's Geocoding API v1, and I want to add a debounce delay of 300ms to reduce API calls. Here's my current code:\n```javascript\nconst debounceDelay = 300;\n```\nCan you help me complete the implementation and suggest improvements? ->-> 1,6",
      id: 20,
      role: "user",
    },
    {
      content:
        "hmm, what about handling cases where the API response time exceeds 300ms? ->-> 1,7",
      id: 22,
      role: "user",
    },
    {
      content:
        "hmm, what if the user types quickly and the debounce delay isn't enough? ->-> 1,8",
      id: 24,
      role: "user",
    },
    {
      content:
        "I'm trying to implement the city autocomplete feature using OpenWeather Geocoding API v1, and I want to make sure I'm handling the 5-item dropdown and 300ms debounce correctly in my `autocomplete.js` file. Here's my current implementation:\n```javascript\nconst autocompleteInput = document.getElementById('autocomplete-input');\n```\nAlso, I'm planning to add error handling for HTTP 401 Unauthorized with a message \"Invalid API key\" in my `fetchWeatherData()` function. ->-> 2,3",
      id: 74,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the autocomplete input lag in my weather app, which is currently over 500ms on slower devices. I've already implemented a debounce delay of 300ms and optimized DOM updates in `autocomplete.js`. However, I'm still experiencing performance issues. Can you help me improve the performance of my autocomplete feature? ->-> 2,11",
      id: 92,
      role: "user",
    },
    {
      content:
        "I'm trying to achieve 100% test coverage on my core modules, including API fetch, autocomplete, and error handling, and I've currently reached 85% as of April 9, 2024. I want to make sure I'm covering all possible scenarios, especially for the autocomplete feature which has a 5-item dropdown and a 300ms debounce. Can you help me write some test cases to cover the remaining 15%? ->-> 3,7",
      id: 148,
      role: "user",
    },
    {
      content:
        "I'm having trouble with the autocomplete event listeners in my `autocomplete.js` file, specifically with addressing the memory leak that occurs when the component is torn down. I've tried properly removing the listeners, but I'm still experiencing issues. Can you help me review my code and suggest improvements?\n```javascript\n// autocomplete.js\nclass Autocomplete {}\n``` ->-> 3,13",
      id: 160,
      role: "user",
    },
    {
      content:
        "I'm trying to add end-to-end tests with Cypress v12 for my weather app, specifically covering user flows like search, autocomplete, error display, and retry mechanism. I've already implemented the autocomplete feature using OpenWeather's Geocoding API v1 and error handling for HTTP 401 Unauthorized. My goal is to achieve 100% test coverage. ->-> 3,18",
      id: 172,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "city-autocomplete-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Software",
        id: 31,
        subtopics: [
          "Debounce",
          "API response time",
          "Dropdown and errors",
          "Memory leaks",
        ],
        theme:
          "Implementing a city autocomplete feature across conversations",
        title:
          "City Autocomplete",
      },
      narratives: "City autocomplete implementation event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You raised these aspects in this order: implementing the debounce delay, handling API response times exceeding the debounce, rapid input bypassing the debounce, the 5-item dropdown with error handling, and reviewing event listener removal to prevent memory leaks.",
            ordering_type: "mention_sequence",
            question:
              "Can you list the order in which I brought up different aspects of implementing the city autocomplete feature across our conversations, in order? Mention ONLY and ONLY five items.",
            question_id: "city-autocomplete-event-order",
            question_type: "event_ordering",
            source_chat_ids: [20, 22, 24, 74, 160],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Developer building a weather app autocomplete",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildProjectDevelopmentEventOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm building my first portfolio website using HTML5, CSS3, and Bootstrap v5.3.0, and I want to create a section that showcases my skills as a Colour Technologist. ->-> 1,2",
      id: 4,
      role: "user",
    },
    {
      content:
        "I'm trying to plan out my project timeline and I have a deadline of April 1, 2024, for the first sprint, which covers the basic layout and navigation of my single-page portfolio website. The project is estimated to take 3 sprints of 2 weeks each. How can I ensure I meet this deadline and complete the project within the estimated 6 weeks? ->-> 1,6",
      id: 12,
      role: "user",
    },
    {
      content:
        "I'm planning a peer review for April 2, 2024, and I want to focus on semantic HTML and accessibility compliance, specifically WCAG 2.1 AA. Can you help me create a checklist for reviewing HTML code to ensure it meets these standards? ->-> 1,16",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm planning to manually test my portfolio website on Chrome 112 and Firefox 110, focusing on layout consistency, and I want to make sure I cover all the necessary scenarios. ->-> 1,21",
      id: 46,
      role: "user",
    },
    {
      content:
        "I'm working on Sprint 2 with a deadline of April 20, 2024, and I need to focus on SEO basics and contact form backend integration. I want to make sure my contact form is properly validated and integrated with the backend. Can you help me implement the contact form backend using Bootstrap 5.3.0 and ensure it meets SEO standards? ->-> 2,12",
      id: 82,
      role: "user",
    },
    {
      content:
        "I'm trying to update my project gallery to include the new cards, but I'm having some issues with the layout. I've added two new projects, so now I have a total of 10 cards, and I want to make sure they're all displayed correctly. ->-> 2,25",
      id: 116,
      role: "user",
    },
    {
      content:
        "I'm trying to optimize the performance of my portfolio site by implementing service worker caching with Workbox v6.5.4, and I've managed to reduce the repeat load time from 1.2s to 400ms, which is a significant improvement. ->-> 3,16",
      id: 158,
      role: "user",
    },
    {
      content:
        "I'm working on finalizing my portfolio site and I've just completed the final code review for my project, which was approved with minor comments on CSS naming conventions on May 3, 2024. I'm trying to ensure that all my CSS classes are properly named and follow best practices, especially that my custom CSS classes don't conflict with Bootstrap's classes. ->-> 3,18",
      id: 164,
      role: "user",
    },
  ];

  return [
    {
      chat: [
        turns.map((turn) => ({
          ...turn,
          index: null,
          question_type: "main_question",
          time_anchor: "unknown",
        })),
      ],
      conversation_id: "project-development-event-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Software",
        id: 32,
        subtopics: [
          "Sprint 1 layout",
          "Sprint 2 SEO",
          "Code review",
        ],
        theme:
          "Building a portfolio website across project sprints",
        title:
          "Project Development",
      },
      narratives: "Portfolio project development event order coverage",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You raised these aspects in this order: planning the first sprint layout and navigation, the second sprint focusing on SEO and contact form backend, and finalizing with a code review on CSS naming conventions.",
            ordering_type: "mention_sequence",
            question:
              "Can you list the order in which I brought up different aspects of my project development throughout our conversations in order? Mention ONLY and ONLY five items.",
            question_id: "project-development-event-order",
            question_type: "event_ordering",
            source_chat_ids: [12, 82, 164],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Developer building a portfolio website",
        user_relationships: "None mentioned",
      },
      user_questions: [],
    },
  ];
}

function buildWeatherAutocompleteBugFixConfirmationBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm trying to optimize the autocomplete feature for my weather app, which has been tested with over 100 city inputs and has an average API response time of 280ms with a 95% success rate on valid cities.",
      id: 80,
      role: "user",
    },
    {
      content:
        "I fixed a bug in autocomplete where duplicate city suggestions appeared after rapid typing, and I updated the debounce cleanup logic.",
      id: 88,
      role: "user",
    },
    {
      content:
        "I reduced autocomplete latency from 520ms to 290ms, but I still need fetchWeatherData error handling.",
      id: 124,
      role: "user",
    },
    {
      content:
        "I fixed a bug where autocomplete suggestions disappeared too early after clicking a result, and I updated autocomplete.js to keep the selected city stable.",
      id: 132,
      role: "user",
    },
    {
      content:
        "I'm adding Cypress end-to-end tests for search, autocomplete, error display, and the retry mechanism.",
      id: 172,
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
      conversation_id: "weather-autocomplete-bug-confirmation",
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
      narratives: "Weather app autocomplete bug fixes",
      probing_questions: {
        contradiction_resolution: [
          {
            answer:
              "Yes. You fixed duplicate autocomplete suggestions after rapid typing and fixed suggestions disappearing too early after selecting a result.",
            question:
              "Have I ever fixed any bugs related to the autocomplete feature in my project?",
            question_id: "weather-autocomplete-bug-confirmation",
            question_type: "contradiction_resolution",
            source_chat_ids: [88, 132],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Weather app developer",
        user_relationships: "OpenWeather",
      },
      user_questions: [],
    },
  ];
}

function buildFlaskLoginSessionManagementContradictionBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Always format all code snippets with syntax highlighting when I ask about implementation details.",
      id: 54,
      role: "user",
    },
    {
      content:
        "Understood! I will ensure that all code snippets are formatted with syntax highlighting when you ask about implementation details.",
      id: 55,
      role: "assistant",
    },
    {
      content:
        "I'm trying to integrate Flask-Login v0.6.2 for session management in my Flask app, specifically for handling user logins and sessions, and I want to replace my manual session handling. I've never written any Flask routes or handled HTTP requests in this project before, but I've completed the user registration and login modules and now I'm focusing on transaction CRUD and analytics integration.",
      id: 66,
      role: "user",
    },
    {
      content:
        "Absolutely, let's integrate Flask-Login into your Flask application to handle user sessions securely with registration, login, session management, transaction CRUD integration, and secure password hashing.",
      id: 67,
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
      conversation_id: "flask-login-session-management-contradiction",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: [
          "Flask-Login",
          "Session management",
          "Transaction CRUD",
        ],
        theme: "Building a monolithic Flask budget tracker",
        title: "Flask budget tracker",
      },
      narratives: "Flask-Login session management contradiction",
      probing_questions: {
        contradiction_resolution: [
          {
            ideal_answer:
              "I notice you've mentioned contradictory information about this. You said you have never integrated Flask-Login or managed user sessions in this project, but you also mentioned that Flask-Login v0.6.2 was integrated for session management replacing manual session handling. Could you clarify which is correct?",
            question:
              "Have I integrated Flask-Login for session management in my project?",
            question_id: "flask-login-session-management-contradiction",
            question_type: "contradiction_resolution",
            source_chat_ids: {
              first_statement: [66],
              second_statement: [66],
            },
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Flask app developer",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildWeatherProjectProgressSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm Christina, a colour technologist, and I'm trying to build a weather app using JavaScript and OpenWeather API v2.5, but I'm having trouble figuring out how to structure my code. I want to make sure I'm using the API correctly and handling errors properly with getWeather(), handleError(), and a simple main() function.",
      id: 6,
      role: "user",
    },
    {
      content:
        "Your approach is on the right track. Improve error handling with descriptive messages, modularize the weather app code into smaller reusable functions, manage the OpenWeather API endpoint and key in a configuration object, validate city input, and use parameter objects for axios requests.",
      id: 7,
      role: "assistant",
    },
    {
      content:
        "hmm, got it, but what about adding the autocomplete feature with the debounce delay?",
      id: 8,
      role: "user",
    },
    {
      content:
        "Adding an autocomplete feature with a debounce delay will enhance the weather app user experience. Create a debounce function, implement getAutocompleteSuggestions(), update the suggestions list dynamically, and use a 300ms delay to reduce excessive API calls.",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "I'm trying to initialize a project using vanilla JavaScript ES2021, HTML5, and CSS3 to target the OpenWeather API endpoint api.openweathermap.org/data/2.5/weather. Can you help me build a basic implementation with error handling and validation?",
      id: 10,
      role: "user",
    },
    {
      content:
        "Create an HTML weather app shell, style it with CSS, and implement fetchWeatherData() against the OpenWeather API with city validation, error messages, and DOM updates for temperature, humidity, and conditions.",
      id: 11,
      role: "assistant",
    },
    {
      content:
        "I'm trying to keep my weather app under 2.5MB, so I prefer using lightweight, dependency-free solutions over heavy frameworks. Can you help me implement a simple caching mechanism for API responses without external libraries using localStorage or an in-memory cache?",
      id: 54,
      role: "user",
    },
    {
      content:
        "Implement a simple dependency-free weather cache with a Map for in-memory storage or localStorage for persistence. Store city weather responses, return cached data when available, and add expiration timestamps so stale OpenWeather API responses can be refreshed.",
      id: 55,
      role: "assistant",
    },
    {
      content:
        "I'm trying to optimize the autocomplete feature in my weather app to reduce API calls while still providing a good user experience. I've decided to limit the results to 5 items and may add advanced caching or adjust the debounce delay.",
      id: 94,
      role: "user",
    },
    {
      content:
        "Use an advanced caching mechanism, adjust the debounce delay, and consider pagination or infinite scrolling for autocomplete results to balance API call reduction with useful search results.",
      id: 95,
      role: "assistant",
    },
    {
      content:
        "I'm trying to implement a custom feature for my weather app to maintain full control and avoid external dependency risks, as per my preference statement, but I'm not sure how to start.",
      id: 122,
      role: "user",
    },
    {
      content:
        "Implementing custom features for your weather app helps maintain full control and avoid external dependencies. Define the feature requirements, design the UI and data structures, implement the code, integrate it into the app, test and debug thoroughly, optimize performance, and document the feature.",
      id: 123,
      role: "assistant",
    },
    {
      content:
        "I'm trying to achieve 100% test coverage on my core modules, including API fetch, autocomplete, and error handling, and I've currently reached 85% as of April 9, 2024.",
      id: 148,
      role: "user",
    },
    {
      content:
        "To reach 100% test coverage, add Jest cases for successful autocomplete responses, empty autocomplete responses, network errors, debounce behavior, rapid input changes, HTTP errors, and general fetchWeatherData() failures.",
      id: 149,
      role: "assistant",
    },
    {
      content:
        "I'm working on a project that was marked feature-complete on April 9, 2024, and I'm ready to collect user feedback. The project has all MVP goals met, 85% test coverage, and an average API response time improved to 220ms after caching and code optimizations.",
      id: 186,
      role: "user",
    },
    {
      content:
        "Prepare the feature-complete project for high-volume user feedback with load testing, performance monitoring, scalability planning, caching refinement, database optimization, robust error logging, structured feedback collection, CI/CD, security, and documentation.",
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
      conversation_id: "weather-project-progress-summary",
      conversation_plan: "BATCH 2 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 3,
        subtopics: [
          "Working with APIs in JavaScript",
          "Adding city autocomplete",
          "Error handling for invalid locations",
          "Deploying on GitHub Pages",
        ],
        theme: "Fetching and displaying weather data for user-specified locations",
        title: "Developing a Weather Forecast App in JavaScript with OpenWeather API",
      },
      narratives: "Weather app project progression",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The weather app progressed from basic OpenWeather API implementation and error handling, through autocomplete with debounce, lightweight dependency-free caching, and a custom feature plan that preserved full implementation control.",
            question:
              "Can you give me a comprehensive summary of how my weather app project has progressed, including the key features, improvements, and development steps we've discussed so far?",
            question_id: "weather-project-progress-summary",
            question_type: "summarization",
            source_chat_ids: [6, 7, 8, 9, 54, 55, 122, 123],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Christina",
        user_relationships: "OpenWeather",
      },
      user_questions: [],
    },
  ];
}

function buildBudgetTrackerProjectLifecycleSummaryBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Sure, let's break it down for my budget tracker project. Components include user authentication with registration, login, and logout; transaction management with add income, add expense, and view transactions; and basic analytics with monthly summaries and category-wise spending. Milestones run from setting up the Flask project and initial database schema through authentication, transaction management, analytics, final adjustments, testing, and deployment.",
      id: 2,
      role: "user",
    },
    {
      content:
        "Yes, this breakdown works well. Let's refine the schedule for the budget tracker project with setup, user authentication, transaction management, basic analytics, final adjustments, testing, and deployment tasks.",
      id: 3,
      role: "assistant",
    },
    {
      content:
        "I'm Craig, a hands-on developer with a practical mindset, eager to build a personal budget tracker using Python and Flask. I want to create a simple web application that allows users to track their expenses and income. Can you help me implement the core functionality of my budget tracker, including user authentication, expense tracking, and data visualization? I've started with the basic setup, but I need help with the implementation details.",
      id: 4,
      role: "user",
    },
    {
      content:
        "Absolutely, Craig! Let's dive into implementing the core functionalities of your budget tracker, including user authentication, expense tracking, and data visualization using Matplotlib. We'll fill in user registration, login, and expense tracking, then add spending visualizations.",
      id: 5,
      role: "assistant",
    },
    {
      content:
        "I'm trying to plan out my project and I want to make sure I meet the April 15 deadline for the MVP scope, which includes income/expense tracking, user login, and basic analytics. Can you help me create a schedule to ensure I complete all these features on time?",
      id: 8,
      role: "user",
    },
    {
      content:
        "Let's create a detailed schedule to meet the April 15, 2024 MVP deadline. Break the budget tracker into phases for initial setup, user authentication, transaction management, basic analytics, final adjustments, testing, and deployment.",
      id: 9,
      role: "assistant",
    },
    {
      content:
        "I'm trying to keep my app lightweight and easy to maintain, so I prefer simple, minimal dependencies while still implementing the necessary features for my personal budget tracker with Flask 2.3.1, SQLite 3.39, local dev on port 5000, and the April 15 MVP deadline.",
      id: 34,
      role: "user",
    },
    {
      content:
        "To keep your Flask app lightweight and maintainable, use a streamlined project structure and minimal dependencies while implementing the essential budget tracker features.",
      id: 35,
      role: "assistant",
    },
    {
      content:
        "I'm trying to optimize the dashboard API response time, which has recently improved to 250ms after adding caching tweaks, but I also want clear documentation and comments in the code while implementing Flask-Login session management.",
      id: 108,
      role: "user",
    },
    {
      content:
        "Use Flask, Flask-Login, Flask-SQLAlchemy, and Flask-Caching for user session management, logging, and basic API optimization.",
      id: 109,
      role: "assistant",
    },
    {
      content:
        "I'm finalizing the deployment of my application and I want to make sure the UI/UX is improved based on user feedback, plus I need to add some security hardening before the public launch. Can you review authentication and authorization using the latest libraries as of April 25, 2024?",
      id: 116,
      role: "user",
    },
    {
      content:
        "Review the UI/UX and security hardening before public launch. Improve the secret key, password hashing, token-based authentication, role-based access control, authorization checks, HTTPS, and deployment safeguards.",
      id: 117,
      role: "assistant",
    },
    {
      content:
        "I'm trying to implement the account lockout feature after 5 failed login attempts using Redis 7.0 for rate limiting. I want to make sure the lockout is triggered only after 5 attempts and properly stored in Redis.",
      id: 150,
      role: "user",
    },
    {
      content:
        "Your Redis account lockout implementation is on the right track. Improve rate limiting, expiry handling, atomic operations, and error handling for the failed login attempt counter and lockout key.",
      id: 151,
      role: "assistant",
    },
    {
      content:
        "I'm trying to detect a memory leak in my application using New Relic APM. I noticed session management memory usage increases by about 40MB over time and I'm considering Redis as a more efficient session store.",
      id: 164,
      role: "user",
    },
    {
      content:
        "To address the Flask session memory leak, analyze memory usage, review session management, optimize session data, and consider Redis instead of filesystem-based sessions.",
      id: 165,
      role: "assistant",
    },
    {
      content:
        "I'm working on a project where I need to document API endpoints and architecture decisions in Confluence, and I want to share it with my remote collaborator for feedback. Can you help me create a Confluence page with API endpoint URL, HTTP method, request body, response format, technology stack, and database schema?",
      id: 176,
      role: "user",
    },
    {
      content:
        "Structure the Confluence page with a title and overview, API endpoint tables, detailed endpoint descriptions, architecture decisions, technology stack, database schema, and optional diagrams for collaborator feedback.",
      id: 177,
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
      conversation_id: "budget-tracker-project-lifecycle-summary",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: [
          "Flask project structure",
          "User authentication",
          "Security hardening",
          "Project documentation",
        ],
        theme: "Creating a basic app to track income and expenses with simple analytics",
        title: "Building a Personal Budget Tracker Web App in Python and Flask",
      },
      narratives: "Budget tracker project lifecycle",
      probing_questions: {
        summarization: [
          {
            ideal_summary:
              "The budget tracker progressed from initial core Flask implementation to an April 15 MVP schedule, security hardening, account lockout, and Confluence documentation for API endpoints and architecture decisions.",
            question:
              "Can you provide a comprehensive summary of how my budget tracker project has progressed, including the key features implemented, the development timeline, security enhancements, and documentation efforts?",
            question_id: "budget-tracker-project-lifecycle-summary",
            question_type: "summarization",
            source_chat_ids: [4, 5, 8, 9, 116, 117, 150, 151, 176, 177],
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

function buildBudgetTrackerAppDevelopmentDeploymentOrderBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "Sure, let's break it down for my budget tracker project. Components include user authentication, transaction management, and basic analytics, with setup, schema, auth, transaction management, analytics, final testing, and deployment milestones.",
      id: 2,
      role: "user",
    },
    {
      content:
        "I'm Craig, a hands-on developer with a practical mindset, eager to build a personal budget tracker using Python and Flask. I want core functionality including user authentication, expense tracking, and data visualization.",
      id: 4,
      role: "user",
    },
    {
      content:
        "I'm trying to initialize a Flask 2.3.1 project on Python 3.11 with SQLite 3.39 as my database, and I want it to run on local dev at port 5000. I need help setting up the project and database connection.",
      id: 6,
      role: "user",
    },
    {
      content:
        "I'm trying to set up a Flask 2.3.1 project with Jinja2 templating and Bootstrap 5.3 for a responsive UI.",
      id: 10,
      role: "user",
    },
    {
      content:
        "I'm trying to design the database schema for my budget tracker, with users and transactions tables.",
      id: 14,
      role: "user",
    },
    {
      content:
        "I'm trying to keep my app lightweight and easy to maintain, so I prefer simple, minimal dependencies while still implementing the necessary budget tracker features.",
      id: 34,
      role: "user",
    },
    {
      content:
        "I'm trying to update my project timeline, and I noticed that the first sprint now targets completion by March 31, which gives us two extra days for final testing and bug fixes.",
      id: 52,
      role: "user",
    },
    {
      content:
        "I'm trying to implement the transaction CRUD in my Flask app, specifically the POST /transactions route, and I want to make sure it returns a 201 status code when a new transaction is created successfully.",
      id: 62,
      role: "user",
    },
    {
      content:
        "I'm working on sprint 2 which targets analytics by April 19, and I've already completed sprint 1 on March 29 with user auth and basic transaction CRUD.",
      id: 86,
      role: "user",
    },
    {
      content:
        "I'm finalizing the deployment of my application and I want to make sure the UI/UX is improved based on user feedback, plus I need to add security hardening before public launch.",
      id: 116,
      role: "user",
    },
    {
      content:
        "I'm having some issues with my deployment on Render.com, specifically with the Gunicorn configuration. I've set up my app to use 3 workers and listen on port 10000, and my integration tests cover user auth, transaction CRUD, and analytics endpoints with a 95% pass rate.",
      id: 118,
      role: "user",
    },
    {
      content:
        "I will add more tests to cover edge cases and security vulnerabilities, specifically SQL injection and XSS before deployment.",
      id: 120,
      role: "user",
    },
    {
      content:
        "I'm documenting API endpoints and architecture decisions in Confluence for my remote collaborator.",
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
      conversation_id: "budget-tracker-app-development-deployment-order",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: [
          "Flask project structure",
          "Transaction management",
          "Deployment",
          "Testing",
        ],
        theme: "Creating a basic app to track income and expenses with simple analytics",
        title: "Building a Personal Budget Tracker Web App in Python and Flask",
      },
      narratives: "Budget tracker app development and deployment ordering",
      probing_questions: {
        event_ordering: [
          {
            answer:
              "You mentioned the app development and deployment aspects in order: setup/database/local server, transaction POST handling, Render/Gunicorn deployment, and security-related test expansion.",
            question:
              "Can you walk me through the order in which I brought up different aspects of my app development and deployment across our conversations? Mention ONLY and ONLY five items.",
            question_id: "budget-tracker-app-development-deployment-order",
            question_type: "event_ordering",
            source_chat_ids: [6, 62, 118, 120],
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

function buildFamilyMovieMarathonTitlesBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm planning a movie marathon for April 6-7, 2024, and I want to make sure I have 5 family-friendly movies that are suitable for ages 2 to 77, can you help me find some that balance entertainment and age appropriateness?",
      id: 18,
      role: "user",
    },
    {
      content:
        'Planning a movie marathon that caters to a wide age range is a fantastic idea! Here are five family-friendly movies that should appeal to everyone from ages 2 to 77: "The Incredibles" (2004), "Finding Nemo" (2003), "The Lion King" (1994), "Coco" (2017), and "Paddington" (2014) with "Paddington 2" (2017). These are suitable for a movie marathon and provide a fun experience for everyone involved.',
      id: 19,
      role: "assistant",
    },
    {
      content:
        "I'm kinda new to making watchlists for family movie marathons, so I've never done this before",
      id: 50,
      role: "user",
    },
    {
      content:
        "Always include platform availability details when I ask about movie options.",
      id: 52,
      role: "user",
    },
    {
      content:
        'I\'m kinda worried that my watchlist for the family movie marathon on April 6-7 might not be finalized yet, so can you help me figure out if the 8 movies I\'ve chosen, including "Soul," "Paddington 2," "The Mitchells vs. The Machines," and "Coco," are all available on the platforms I subscribe to, considering I\'ve coordinated with Thomas to start the marathon at 3 PM on April 6 and 1 PM on April 7 to accommodate Amy and Kyle\'s arrival?',
      id: 56,
      role: "user",
    },
    {
      content:
        'Sure, I can help you check the availability of those movies on the streaming platforms you currently subscribe to, which are Netflix and Disney+. Here\'s a quick rundown based on the titles you mentioned:\n\n1. **"Soul"** - Available on Disney+.\n2. **"Paddington 2"** - Not available on Netflix or Disney+. This might require renting or subscribing to another service like Amazon Prime Video.\n3. **"The Mitchells vs. The Machines"** - Available on Netflix.\n4. **"Coco"** - Available on Disney+.\n\nTo round out your list, here are some additional family-friendly movies that are also available on Netflix.',
      id: 57,
      role: "assistant",
    },
    {
      content:
        'I think I\'ll go ahead and rent "Paddington 2" since it\'s a favorite of both Thomas and Michelle. The extra cost isn\'t too bad, and it\'ll be worth it for the kids. Thanks for checking the availability!',
      id: 58,
      role: "user",
    },
    {
      content:
        'Great choice! Here\'s a summary of the movies you\'ve selected, along with their availability: "Soul" - Available on Disney+, "Paddington 2" - Rentable on Amazon Prime Video ($3.99), "The Mitchells vs. The Machines" - Available on Netflix, "Coco" - Available on Disney+, "Moana" - Available on Disney+, "Zootopia" - Available on Disney+, "Tangled" - Available on Disney+, "The Secret Life of Pets" - Available on Netflix.',
      id: 59,
      role: "assistant",
    },
    {
      content:
        "What movies would be suitable for my family weekend, considering platforms that allow simultaneous streaming on multiple devices within my updated budget?",
      id: 62,
      role: "user",
    },
    {
      content:
        "I've invited Mason and Michael to join the April 7 afternoon session, but Michael declined due to a work deadline, so I need help finding alternative activities or movies that would be suitable for Mason and the rest of the family, considering the confirmed schedule",
      id: 90,
      role: "user",
    },
    {
      content:
        'What movies would you recommend for a family weekend like ours, considering Michelle\'s love for "Coco" and Francis enjoying "Paddington 2", to ensure everyone has a great time on April 8, 2024, at 10:00 AM?',
      id: 110,
      role: "user",
    },
    {
      content:
        'Given your family\'s preferences, here are some movie recommendations: "Moana" (PG) - a great fit for Michelle, who loves musicals, and Francis will enjoy the adventure aspects. "Zootopia" (PG) - humor, adventure, and important life lessons for the whole family.',
      id: 111,
      role: "assistant",
    },
    {
      content:
        'Thanks for the recommendations! I think "Moana" and "Zootopia" sound perfect for Michelle and Francis. Could you help me plan the timing for these movies, maybe with a short break in between for snacks?',
      id: 112,
      role: "user",
    },
    {
      content:
        'Absolutely! Here\'s a suggested schedule for your family movie day on April 8, 2024, starting at 10:00 AM: "Moana" (PG) from 10:00 AM to 11:30 AM, a 15-minute break with popcorn with custom seasoning and perhaps some fruit platters or themed cupcakes from The Sweet Spot bakery, then "Zootopia" (PG) from 11:45 AM to 1:15 PM.',
      id: 113,
      role: "assistant",
    },
    {
      content:
        "That schedule sounds perfect! For snacks, I think we'll stick with popcorn and fruit platters. Maybe we can add some themed cookies too. Any ideas for a quick activity during the break? Something simple that the kids would enjoy?",
      id: 114,
      role: "user",
    },
    {
      content:
        'Great choice on the snacks! During the snack break the kids can enjoy Crafting Paper Flowers (Inspired by "Moana") with construction paper and markers, or Animal Masks (Inspired by "Zootopia") with paper plates.',
      id: 115,
      role: "assistant",
    },
    {
      content:
        "Always provide alternative movie suggestions when I ask about family-friendly options.",
      id: 158,
      role: "user",
    },
    {
      content:
        'Can you suggest some family-friendly movies available on streaming platforms that we can watch during our outdoor movie night, given that we\'re planning themed snacks inspired by "Wish" and have allocated $30 for them?',
      id: 206,
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
      conversation_id: "family-movie-marathon-titles",
      conversation_plan: "BATCH 14 PLAN",
      conversation_seed: {
        category: "Family Entertainment Planning",
        id: 14,
        subtopics: [
          "Movie marathon planning",
          "Streaming availability",
          "Family schedules",
        ],
        theme: "Planning family movie marathons across sessions",
        title: "Family Movie Marathon Planning",
      },
      narratives: "Family movie marathon title planning across sessions",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer: "13 unique movies",
            question:
              "How many unique movies have I planned to watch across all my family movie marathons, considering the titles I mentioned for April 6-7 and April 8?",
            question_id: "family-movie-marathon-titles",
            question_type: "multi_session_reasoning",
            source_chat_ids: [18, 56, 57, 58, 59, 110, 111, 112, 113, 114, 115],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Parent planning family movie weekends",
        user_relationships: "Thomas, Michelle, Francis, Amy, Kyle, Mason, Michael",
      },
      user_questions: [],
    },
  ];
}

function buildResumeAtsSequencingBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda stuck on this LinkedIn Learning course, I've only completed 40% of it by March 15, 2024, and I'm not sure if I'll be able to optimize my resume for ATS by the time I'm done",
      id: 22,
      role: "user",
    },
    {
      content:
        "I understand your concern about completing the LinkedIn Learning course and optimizing your resume for ATS by the time you finish. Here are some steps to help you stay on track: Prioritize Key Concepts and focus on the most critical concepts that will help you optimize your resume for ATS, identifying the key takeaways and practical tips that are immediately applicable.",
      id: 23,
      role: "assistant",
    },
    {
      content:
        "I prefer using structured bullet points with quantified achievements over narrative paragraphs for clarity and ATS readability, can you help me create a sample resume section that showcases my skills in a way that's clear and concise, like using numbers and percentages to demonstrate my accomplishments?",
      id: 36,
      role: "user",
    },
    {
      content:
        "Absolutely, using structured bullet points with quantified achievements can make your resume more clear, concise, and ATS-friendly. Here's a sample resume section that showcases your skills and accomplishments using numbers and percentages for your work experience as a television and film producer.",
      id: 37,
      role: "assistant",
    },
    {
      content:
        "Always use structured bullet points with quantified achievements when I ask about resume formatting preferences.",
      id: 46,
      role: "user",
    },
    {
      content:
        "I'm kinda curious, between April 25 and May 1, 2024, how can I leverage the fact that I secured 5 interviews to further improve my resume and increase my chances of getting more callbacks?",
      id: 92,
      role: "user",
    },
    {
      content:
        "Securing 5 interviews in a short period is a strong indication that your resume is effective, but there are still ways to further improve it to increase your chances of getting more callbacks. Here are some strategies: Analyze Feedback from Interviews by collecting and reviewing any feedback from the interviews you have had, which can provide valuable insights.",
      id: 93,
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
        "I prefer using bullet points with quantified results over paragraphs, but how can I make sure that improves ATS parsing and recruiter readability, like you would with a normal resume?",
      id: 124,
      role: "user",
    },
    {
      content:
        "Using bullet points with quantified results is an excellent approach for both ATS parsing and recruiter readability. This format is clear, concise, and easy to scan, which can significantly improve your chances of advancing in the hiring process.",
      id: 125,
      role: "assistant",
    },
    {
      content:
        "I just achieved something big, completing those 3 online courses on digital media leadership with a 95% average score by July 6, 2024, and I'm wondering how I can best highlight this achievement in my resume to make it pass any applicant tracking system - any tips?",
      id: 136,
      role: "user",
    },
    {
      content:
        "Congratulations on completing those three online courses on digital media leadership with a 95% average score! Highlighting this significant achievement in your resume is crucial for making it stand out and ensuring it passes through applicant tracking systems (ATS). Use a clear and prominent dedicated section in your resume for these courses.",
      id: 137,
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
      conversation_id: "resume-ats-sequencing",
      conversation_plan: "BATCH 6 PLAN",
      conversation_seed: {
        category: "Career Development",
        id: 6,
        subtopics: [
          "Resume optimization",
          "ATS compatibility",
          "Interview preparation",
        ],
        theme: "Sequencing resume updates across course progress and interviews",
        title: "Resume ATS Optimization Journey",
      },
      narratives: "Resume ATS sequencing reasoning across course and interview sessions",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "First integrate key ATS optimization concepts from the course progress, then highlight recent interview feedback and quantified achievements, then prominently feature the completed digital media leadership courses.",
            question:
              "Considering my progress, achievements, and interview successes, how can I best sequence my resume updates to maximize ATS compatibility and increase interview callbacks?",
            question_id: "resume-ats-sequencing",
            question_type: "multi_session_reasoning",
            source_chat_ids: [22, 23, 92, 93, 136, 137],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Television and film producer seeking executive roles",
        user_relationships: "Recruiters, hiring managers",
      },
      user_questions: [],
    },
  ];
}

function buildPeerFeedbackBalanceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm sorta excited that Joseph, a fellow producer, suggested peer review sessions starting Feb 20, and it's already improved my drafts by 15%, but I'm not sure what to expect next or how to keep that momentum going, can you offer some guidance??",
      id: 12,
      role: "user",
    },
    {
      content:
        "It's great to hear that the peer review sessions with Joseph have already shown positive results, improving your drafts by 15%. To keep this momentum going and continue to see improvements, here are some strategies you can implement in your upcoming sessions.",
      id: 13,
      role: "assistant",
    },
    {
      content:
        "That sounds like a solid plan! I think sticking to a regular schedule and setting clear objectives for each session will really help. I'm also excited about the idea of expanding the peer review group to get more diverse feedback. Let's start with the structure you suggested.",
      id: 14,
      role: "user",
    },
    {
      content:
        "You're welcome! I'm glad you found the plan helpful. Starting with structured sessions and gradually expanding your peer review group is a great approach. Here's a summary of the steps you can take to get started with Structured Peer Review Sessions on a regular schedule.",
      id: 15,
      role: "assistant",
    },
    {
      content:
        "I'm kinda worried about my writing progress, especially since Amy suggested a Zoom peer review on April 5, and I saw a 25% improvement in dialogue clarity - how can I keep this momentum going with my screenplay draft?",
      id: 70,
      role: "user",
    },
    {
      content:
        "It's great to hear that you've seen significant improvements in your dialogue clarity through peer reviews! To keep this momentum going, here are some strategies you might consider: Regular Peer Reviews, continuing to schedule regular peer review sessions with your group.",
      id: 71,
      role: "assistant",
    },
    {
      content:
        "That sounds like a solid plan. I definitely want to keep up the peer reviews with Amy and others. Setting specific goals for each session makes sense too. I'll stick with Grammarly and Hemingway, and maybe give ProWritingAid a try again. Tracking my progress will help me stay motivated.",
      id: 72,
      role: "user",
    },
    {
      content:
        "You're welcome! It's great to hear that you're feeling positive about the plan. Here are a few additional tips to ensure you stay on track and continue making progress: Consistent Feedback Loop, making sure to schedule regular peer review sessions with Amy and the wider group.",
      id: 73,
      role: "assistant",
    },
    {
      content:
        "Sounds good! I'll start looking for a freelance editor now. I'll check platforms like Upwork and Reedsy, and also ask Amy and Carla for recommendations. I'll make sure to review their profiles and portfolios and ask about their experience.",
      id: 102,
      role: "user",
    },
    {
      content:
        "You're very welcome! That sounds like a thorough and thoughtful approach. Here are a few additional tips to help you through the process of finding and working with a freelance editor for your screenplay.",
      id: 103,
      role: "assistant",
    },
    {
      content:
        "Always provide percentage improvements when I ask about editing progress.",
      id: 172,
      role: "user",
    },
    {
      content:
        "I've got 5 detailed critiques from Joseph's beta readers by May 30, and I'm trying to decide how to use them to improve my writing, should I focus on the suggestions from the peer reviewers or try to find a balance between their feedback and my own vision",
      id: 178,
      role: "user",
    },
    {
      content:
        "Great that you have detailed critiques from Joseph's beta readers! Balancing external feedback with your own vision is crucial for refining your writing while staying true to your artistic intent. Here are some steps to help you effectively integrate the feedback.",
      id: 179,
      role: "assistant",
    },
    {
      content:
        "Thanks for the steps! I think categorizing the feedback first will really help me see the bigger picture. I'll definitely focus on the major issues that multiple readers pointed out, like the tone inconsistencies. And yeah, keeping my original vision in mind is important.",
      id: 180,
      role: "user",
    },
    {
      content:
        "Glad to hear that the plan sounds solid! Categorizing the feedback and focusing on the major issues identified by multiple readers is a great way to start. Here are a few additional tips to ensure you stay on track: Create a Feedback Summary as you categorize each critique.",
      id: 181,
      role: "assistant",
    },
    {
      content:
        "I've added Saturday 10 AM sessions to my writing schedule starting May 18 to accommodate my editing workload, and I'm hoping this will help me stay on track, but I'd love some advice on how to make the most of these new sessions",
      id: 188,
      role: "user",
    },
    {
      content:
        "Adding Saturday 10 AM sessions to your writing schedule is a great step towards managing your editing workload more effectively. Here are some strategies to help you make the most of these new sessions: Set Clear Objectives for each block.",
      id: 189,
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
      conversation_id: "peer-feedback-balance",
      conversation_plan: "BATCH 10 PLAN",
      conversation_seed: {
        category: "Writing Assistant & Learning",
        id: 10,
        subtopics: [
          "Peer review sessions",
          "Editing tools",
          "Beta reader feedback",
        ],
        theme: "Balancing external feedback with personal vision across sessions",
        title: "Screenplay Feedback Integration Journey",
      },
      narratives: "Peer feedback balance reasoning across review sessions",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "Prioritize the structured peer review momentum from Joseph and Amy, then integrate the categorized beta-reader critiques while keeping the original artistic vision as the deciding filter.",
            question:
              "Considering the improvements I reported from Joseph's peer reviews, Amy's Zoom sessions, and the detailed critiques from beta readers, how should I prioritize balancing external feedback with my own vision to maximize overall writing progress?",
            question_id: "peer-feedback-balance",
            question_type: "multi_session_reasoning",
            source_chat_ids: [12, 14, 15, 70, 71, 72, 73, 178, 179, 180, 181],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Screenwriter and producer",
        user_relationships: "Joseph, Amy, Carla",
      },
      user_questions: [],
    },
  ];
}

function buildReadingPlanBalanceBeamRows(): unknown[] {
  const turns = [
    {
      content:
        "I'm kinda hesitant to commit to long sagas, you know, over 5 books, 'cause I've got time constraints from my producer job, so can you help me find a series that's not too long?",
      id: 44,
      role: "user",
    },
    {
      content:
        "I reserved 3 historical fiction e-books at Montserrat Public Library for pickup on December 15, but I'm not sure if I should prioritize those or look for something new, can you help me decide what to read next?",
      id: 100,
      role: "user",
    },
    {
      content:
        "Absolutely, I can help you decide what to read next. Here are some factors to consider when deciding whether to prioritize the historical fiction e-books you reserved or look for something new this season.",
      id: 101,
      role: "assistant",
    },
    {
      content:
        'I chose "The Poppy War" trilogy over "The Broken Earth" series because of community ratings and length, but now I\'m wondering if I made the right choice, can you help me decide if I should stick with it?',
      id: 116,
      role: "user",
    },
    {
      content:
        'Certainly! Deciding between "The Poppy War" trilogy and "The Broken Earth" series can be a tough choice, but let\'s break down the pros and cons of each to help you make an informed decision about your reading plan.',
      id: 117,
      role: "assistant",
    },
    {
      content:
        'I think I\'ll stick with "The Poppy War" trilogy for now. I\'m already enjoying it and it fits well with my reading goals. Plus, the community feedback has been really positive. But if I feel like I\'m missing out, I might revisit the other series later.',
      id: 118,
      role: "user",
    },
    {
      content:
        'That sounds like a great plan! Sticking with "The Poppy War" trilogy for now is a wise choice, especially since you\'re already enjoying it and it aligns well with your reading goals. Here are a few additional thoughts to keep your momentum going.',
      id: 119,
      role: "assistant",
    },
    {
      content:
        "I'm trying to decide on a must-read fiction series for winter evenings, and I've extended my reading challenge goal to 12 books by March 1, which means I need to increase my weekly reading pace",
      id: 136,
      role: "user",
    },
    {
      content:
        "Extending your reading challenge goal to 12 books by March 1 is a great ambition! To help you achieve this, let's select a must-read fiction series that will keep you engaged and motivated through the winter.",
      id: 137,
      role: "assistant",
    },
    {
      content:
        "Absolutely! Given your preference for immersive fiction that blends fantasy and historical elements, and considering you're looking for something to enjoy during the winter evenings leading up to the new year, here are some recommendations.",
      id: 143,
      role: "assistant",
    },
    {
      content:
        'I\'m kinda excited to start "The Expanse" series, but I\'m also a bit concerned about committing to 9 books, so can you help me figure out if it\'s worth it after finishing "The Poppy War"?',
      id: 158,
      role: "user",
    },
    {
      content:
        'Absolutely! "The Expanse" series is a fantastic choice, and while it is a substantial commitment with nine books (and counting), it offers a rich and rewarding reading experience. Here are some factors to weigh.',
      id: 159,
      role: "assistant",
    },
    {
      content:
        'Thanks for the detailed breakdown! I think I\'m ready to dive into "The Expanse." I\'ll mix reading the print edition during my mornings and listening to the audiobooks during my commutes with Douglas.',
      id: 160,
      role: "user",
    },
    {
      content:
        "That sounds like a fantastic plan! Mixing print reading in the mornings with audiobooks during your commutes is a great way to keep the story fresh and engaging. Here are a few tips to help you get the most out of both formats.",
      id: 161,
      role: "assistant",
    },
    {
      content:
        'I\'ve just finished "The Expanse" first three books and I\'m on schedule, but now I need help figuring out how to balance my reading goals with my desire to try different genres, like the standalone historical novels.',
      id: 218,
      role: "user",
    },
    {
      content:
        "Balancing your reading goals with your desire to explore different genres is a great way to keep your reading experience varied and enjoyable. Here are some strategies to help you achieve both this quarter.",
      id: 219,
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
      conversation_id: "reading-plan-balance",
      conversation_plan: "BATCH 13 PLAN",
      conversation_seed: {
        category: "Reading & Entertainment",
        id: 13,
        subtopics: [
          "Series selection",
          "Reading formats",
          "Time budgeting",
        ],
        theme: "Balancing series length against time constraints",
        title: "Reading Plan Balance Journey",
      },
      narratives: "Reading plan balance reasoning across series choices",
      probing_questions: {
        multi_session_reasoning: [
          {
            answer:
              "The plan starts from the under-five-books constraint, commits to The Poppy War trilogy on ratings and length, then takes on The Expanse with a mixed print-morning and audiobook-commute format to fit the time budget.",
            question:
              "Considering my choices and preferences across all sessions, how does my reading plan balance shorter series and longer commitments while fitting my time constraints and enjoyment goals?",
            question_id: "reading-plan-balance",
            question_type: "multi_session_reasoning",
            source_chat_ids: [44, 116, 117, 118, 119, 158, 159, 160, 161],
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Producer and avid reader",
        user_relationships: "Douglas",
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

  it("keeps weather feature and concern count source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-weather-feature-concern-count",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWeatherFeatureConcernCountBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([32, 34, 36, 122, 190]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps dashboard API response-time update source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-dashboard-api-response-time-update",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildDashboardApiResponseTimeUpdateBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([86, 114]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps Alexis financial-management summary synthesis turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-alexis-financial-management-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildAlexisFinancialManagementSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([13, 15, 53, 65, 127, 253]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps personal finance planning summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-personal-finance-planning-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-11T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPersonalFinancePlanningSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([31, 83, 87, 193, 231]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps portfolio first-sprint deadline updates through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-portfolio-sprint-deadline-update",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPortfolioSprintDeadlineUpdateBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([12, 52]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps conditional probability practice quantity updates through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-conditional-probability-practice-update",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildConditionalProbabilityPracticeUpdateBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([84, 86, 88, 130]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps raise rejection and final meeting interval boundaries through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-raise-rejection-final-meeting-interval",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildRaiseRejectionFinalMeetingIntervalBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([56, 64]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps sprint deadline date boundaries without instruction noise through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-budget-tracker-sprint-analytics-temporal",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildBudgetTrackerSprintAnalyticsTemporalBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([28, 86]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps login implementation instruction continuations through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-login-instruction-continuation",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildLoginInstructionContinuationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([54, 56]);
    expect(testCase?.evidenceChatRecall).toBe(1);
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

  it("keeps estate-planning process summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-estate-planning-process-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-11T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildEstatePlanningProcessSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];
    expect(testCase?.retrievedChatIds).toEqual([23, 33, 69, 179, 189]);
    expect(testCase?.evidenceChatRecall).toBe(1);
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

  it("keeps pilot episode timeline summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-pilot-episode-timeline-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-11T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPilotEpisodeTimelineSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      33,
      39,
      127,
      157,
      205,
      251,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps writing skills and confidence summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-writing-skills-confidence-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-11T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWritingSkillsConfidenceSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      1,
      3,
      7,
      9,
      183,
      241,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps basic family-movie project summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-family-movie-basic-project-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFamilyMovieBasicProjectSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([4, 9, 13]);
    expect(testCase?.evidenceChatRecall).toBe(1);
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

  it("keeps city autocomplete implementation event-order source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-weather-autocomplete-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWeatherAutocompleteEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([20, 22, 24, 74, 160]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps research and writing project event-order source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-research-writing-projects-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildResearchWritingProjectsEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([16, 54, 122, 168, 216]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps final draft word-count evidence after the research writing event-order turn", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-research-writing-projects-word-count",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildResearchWritingProjectsEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases.find(
      (item) =>
        item.questionId === "research-writing-projects-final-draft-word-count",
    );

    expect(testCase?.retrievedChatIds).toEqual([116, 158]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps probability foundational concepts event-order source pairs through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-probability-concepts-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildProbabilityConceptsEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      6, 10, 14, 16, 18, 20, 24, 30, 34, 50, 56, 58,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps resume improvement area anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-resume-improvement-areas",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildResumeImprovementAreasBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([28, 72, 122, 158]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps entertainment spending optimization reasoning anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-entertainment-spending-optimization",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildEntertainmentSpendingOptimizationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([26, 27, 66, 142]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps personal statement application-type anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-personal-statement-application-types",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPersonalStatementApplicationTypesBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([10, 82, 130]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps writing group deadline update evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-writing-group-deadline",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWritingGroupDeadlineBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([86, 168, 170]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the two-factor authentication contradiction triple through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-two-factor-auth-implementation",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTwoFactorAuthImplementationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([142, 180, 182]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps final decision meeting update evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-final-decision-meeting",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFinalDecisionMeetingBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([38, 40, 64]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps book series and genre anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-book-series-genres",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildBookSeriesGenresBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([34, 130, 190]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the transaction-to-deployment interval pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-transaction-deployment-weeks",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTransactionDeploymentWeeksBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([0, 2]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the triangle problem-count interval pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-triangle-problem-count",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTriangleProblemCountBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([30, 82]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the ATS course enrollment contradiction pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-ats-course-enrollment",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildAtsCourseEnrollmentBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([22, 48]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the executive producer interview update pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-executive-producer-interviews",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildExecutiveProducerInterviewsBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([62, 92]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the resume tailoring apply-days interval pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-resume-tailoring-apply-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildResumeTailoringApplyDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([14, 16]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the reunion-to-promotion interval pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-reunion-promotion-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildReunionPromotionDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([120, 186]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the screenplay draft interval pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-screenplay-draft-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildScreenplayDraftDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([20, 54]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the editing challenge interval pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-editing-challenge-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildEditingChallengeDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([88, 218]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the AI ethics webinar update pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-ai-ethics-webinar",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildAiEthicsWebinarBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([70, 82]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the winter reading challenge update pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-winter-reading-challenge",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWinterReadingChallengeBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([126, 136]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the family movie invite contradiction pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-family-movie-invite",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFamilyMovieInviteBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([108, 148]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the event cupcake order designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-event-cupcake-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildEventCupcakeOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([132, 156]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the remote work schedule designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-remote-work-schedule",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildRemoteWorkScheduleBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([214]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the immigration consultant session designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-immigration-consultant-session",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildImmigrationConsultantSessionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([138]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the timeline date format instruction evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-timeline-date-format-instruction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTimelineDateFormatInstructionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([66]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the festival relationship duration designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-festival-relationship-duration",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFestivalRelationshipDurationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([1]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the onboarding modules completion designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-onboarding-modules-completion",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildOnboardingModulesCompletionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([108]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the Outlander reading days designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-outlander-reading-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildOutlanderReadingDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([296]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the movie list game night days designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-movie-list-game-night-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildMovieListGameNightDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([208]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the sneaker choice recall designated evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-sneaker-choice-recall",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildSneakerChoiceRecallBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([1]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps sneaker budget comparison reasoning anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-sneaker-budget-comparison-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildSneakerBudgetComparisonReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([38, 72]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps daily walking goal to festival months interval anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-daily-walking-goal-festival-months",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildDailyWalkingGoalFestivalMonthsBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([36, 270]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps holiday gift budget update evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-holiday-gift-budget-update",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildHolidayGiftBudgetUpdateBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([250, 266]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps emergency fund days interval anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-emergency-fund-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildEmergencyFundDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([76, 146]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps prior art to provisional patent days interval anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-prior-art-provisional-patent-days",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPriorArtProvisionalPatentDaysBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([32, 70]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps probate timeline update evidence through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-probate-timeline-update",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildProbateTimelineUpdateBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([112, 122]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps work boundary order reasoning anchors through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-work-boundary-order-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWorkBoundaryOrderReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([48, 216]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the will attorney meeting contradiction pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-will-attorney-meeting-contradiction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWillAttorneyMeetingContradictionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([34, 64]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the legal terms explanation standing instruction through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-legal-terms-explanation-instruction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildLegalTermsExplanationInstructionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([62]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the patent timelines standing instruction through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-patent-timelines-instruction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPatentTimelinesInstructionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([66]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the non-provisional filing date standing instruction pair through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-non-provisional-filing-instruction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildNonProvisionalFilingInstructionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([180, 182]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the career relocation event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-career-relocation-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildCareerRelocationEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([18, 56, 108, 176, 244]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the AI hiring event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-ai-hiring-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildAiHiringEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([24, 26, 28, 106, 108, 192]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the patent funding event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-patent-funding-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPatentFundingEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([30, 164, 200, 202, 204, 206]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the combinatorics probability event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-combinatorics-probability-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildCombinatoricsProbabilityEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([28, 76]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the sneaker safety event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-sneaker-safety-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildSneakerSafetyEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([54, 94, 138, 184, 262]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the patent process stages event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-patent-process-stages-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPatentProcessStagesEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([32, 70, 122, 188, 190]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the academic mentorship event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-academic-mentorship-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildAcademicMentorshipEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([14, 64, 124, 170, 214]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the mentor interactions event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-mentor-interactions-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildMentorInteractionsEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([30, 138, 196, 198, 254, 258]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the hiring automation topics event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-hiring-automation-topics-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildHiringAutomationTopicsEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([44, 46, 104, 198, 200]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the city autocomplete event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-city-autocomplete-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildCityAutocompleteEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([20, 22, 24, 74, 160]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps the project development event order coverage through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-project-development-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildProjectDevelopmentEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([12, 82, 164]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps autocomplete bug-fix confirmation source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-weather-autocomplete-bug-confirmation",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWeatherAutocompleteBugFixConfirmationBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([88, 132]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps same-message Flask-Login contradiction source turn through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-flask-login-session-management-contradiction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFlaskLoginSessionManagementContradictionBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([66]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps broad weather app project progress source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-weather-project-progress-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildWeatherProjectProgressSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      6,
      7,
      8,
      9,
      54,
      55,
      122,
      123,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps budget tracker lifecycle summary source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-budget-tracker-project-lifecycle-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildBudgetTrackerProjectLifecycleSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      4,
      5,
      8,
      9,
      116,
      117,
      150,
      151,
      176,
      177,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps app development and deployment event-order source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-budget-tracker-app-development-deployment-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildBudgetTrackerAppDevelopmentDeploymentOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([6, 62, 118, 120]);
    expect(testCase?.evidenceChatRecall).toBe(1);
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

  it("keeps security feature count source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-security-feature-count-reasoning",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildSecurityFeatureCountReasoningBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([16, 84, 150]);
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

  it("keeps probability understanding summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-probability-understanding-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildProbabilityUnderstandingSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      6,
      7,
      11,
      13,
      15,
      31,
      43,
      57,
      59,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps triangle similarity and congruence summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-triangle-similarity-congruence-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-11T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildTriangleSimilarityCongruenceSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      144,
      145,
      147,
      150,
      151,
      152,
      153,
      158,
      159,
      162,
      163,
    ]);
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

  it("keeps personal-statement application deadline dates through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-personal-statement-application-deadline-extraction",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(
            buildPersonalStatementApplicationDeadlineExtractionBeamRows(),
          ),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([12]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps personal-statement mentor and advisor feedback milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-personal-statement-mentor-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPersonalStatementMentorSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([5, 61, 147, 165, 251]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps professional-development and project-responsibility summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-professional-development-project-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildProfessionalDevelopmentProjectSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([8, 84, 202, 204, 252]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps Greg research and writing-project summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-greg-research-writing-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildGregResearchWritingSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      16,
      54,
      56,
      152,
      168,
      216,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps reading plan balance reasoning source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-reading-plan-balance",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildReadingPlanBalanceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      44,
      116,
      117,
      118,
      119,
      158,
      159,
      160,
      161,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps peer feedback balance reasoning source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-peer-feedback-balance",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildPeerFeedbackBalanceBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      12,
      14,
      15,
      70,
      71,
      72,
      73,
      178,
      179,
      180,
      181,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps resume ATS sequencing reasoning source turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-resume-ats-sequencing",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildResumeAtsSequencingBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      22,
      23,
      92,
      93,
      136,
      137,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps family movie marathon planned-title turns through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-family-movie-marathon-titles",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-12T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFamilyMovieMarathonTitlesBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      18,
      56,
      57,
      58,
      59,
      110,
      111,
      112,
      113,
      114,
      115,
    ]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps fiction-book selection and budgeting summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-fiction-book-budget-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildFictionBookBudgetSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([35, 125, 201, 239, 271]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps reading-goal and strategy progression summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-reading-goals-strategy-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildReadingGoalsStrategySummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([28, 79, 81, 195, 217]);
    expect(testCase?.evidenceChatRecall).toBe(1);
  });

  it("keeps Robert academic mentorship summary milestones through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-robert-academic-mentor-summary",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildRobertAcademicMentorSummaryBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([14, 64, 124, 170, 214]);
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

  it("keeps Stephen relationship-belief event-order source groups through the BEAM diagnostic path", async () => {
    const report = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-beam-stephen-relationship-belief-event-order",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-06T00:00:00.000Z"),
        readFile: async () =>
          JSON.stringify(buildStephenRelationshipBeliefEventOrderBeamRows()),
        writeFile: async () => undefined,
      },
    );

    const testCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(testCase?.retrievedChatIds).toEqual([
      58,
      60,
      74,
      110,
      112,
      164,
      166,
      168,
      232,
      234,
      236,
      258,
      260,
      262,
    ]);
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
