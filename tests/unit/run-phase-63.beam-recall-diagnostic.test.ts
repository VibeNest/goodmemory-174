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
