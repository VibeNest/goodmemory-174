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
});
