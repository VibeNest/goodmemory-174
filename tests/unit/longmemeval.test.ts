import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src/api/createGoodMemory";
import type { GoodMemory } from "../../src/api/contracts";
import { createLongMemEvalMemoryFactory } from "../../scripts/run-phase-62-eval";
import {
  createLongMemEvalGoodMemoryContextBuilder,
  deriveLongMemEvalAssistantEvidenceFacts,
  normalizeLongMemEvalProfileList,
  runLongMemEvalRecallDiagnostic,
  runLongMemEvalSuite,
  scoreLongMemEvalAnswer,
  validateLongMemEvalCases,
} from "../../src/eval/longmemeval";

const SMOKE_CASES = [
  {
    answer: "Mira prefers concise architecture notes.",
    answer_session_ids: ["s-2"],
    haystack_dates: ["2026-01-01", "2026-01-02"],
    haystack_session_ids: ["s-1", "s-2"],
    haystack_sessions: [
      [
        {
          content: "We talked about unrelated release chores.",
          role: "user",
        },
      ],
      [
        {
          content: "Please remember that Mira prefers concise architecture notes.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What note style does Mira prefer?",
    question_date: "2026-01-03",
    question_id: "q-preference-1",
    question_type: "single-session-preference",
  },
  {
    answer: "No answer.",
    answer_session_ids: [],
    haystack_dates: ["2026-01-04"],
    haystack_session_ids: ["s-3"],
    haystack_sessions: [
      [
        {
          content: "No one mentioned a deployment region.",
          role: "user",
        },
      ],
    ],
    question: "Which deployment region did Mira choose?",
    question_date: "2026-01-05",
    question_id: "q-region_abs",
    question_type: "single-session-user",
  },
];

const LONGMEMEVAL_EVENT_RECALL_CASES = [
  {
    answer: "3",
    answer_session_ids: ["s-pickup", "s-return", "s-new-pair"],
    haystack_dates: ["2023/02/15", "2023/02/16", "2023/02/17"],
    haystack_session_ids: ["s-pickup", "s-return", "s-new-pair"],
    haystack_sessions: [
      [
        {
          content:
            "I still need to pick up my dry cleaning for the navy blue blazer I wore to a meeting a few weeks ago.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content: "I need to return some boots to Zara, actually.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just exchanged a pair of boots and I still need to pick up the new pair.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many items of clothing do I need to pick up or return from a store?",
    question_date: "2023/02/18",
    question_id: "q-clothing-pickup-return",
    question_type: "multi-session",
  },
  {
    answer: "25:50",
    answer_session_ids: ["s-5k-old", "s-5k-latest"],
    haystack_dates: ["2023/05/23", "2023/05/30"],
    haystack_session_ids: ["s-5k-old", "s-5k-latest"],
    haystack_sessions: [
      [
        {
          content:
            "I recently set a personal best time in a charity 5K run with a time of 27:12.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm hoping to beat my personal best time of 25:50 this time around.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What was my personal best time in the charity 5K run?",
    question_date: "2023/05/31",
    question_id: "q-personal-best-5k",
    question_type: "knowledge-update",
  },
];

const LONGMEMEVAL_ASSISTANT_EVIDENCE_CASES = [
  {
    answer: "Admon was assigned to the 8 am - 4 pm Day Shift on Sundays.",
    answer_session_ids: ["s-assistant-schedule"],
    haystack_dates: ["2023/03/01"],
    haystack_session_ids: ["s-assistant-schedule"],
    haystack_sessions: [
      [
        {
          content:
            "Shift Rotation Sheet\n\n|  | 8 am - 4 pm (Day Shift) | 12 pm - 8 pm |\n| --- | --- | --- |\n| Sunday | Admon | Magdy |",
          has_answer: true,
          role: "assistant",
        },
      ],
    ],
    question: "What was the rotation for Admon on a Sunday?",
    question_date: "2023/03/02",
    question_id: "q-assistant-shift-answer",
    question_type: "single-session-assistant",
  },
];

const LONGMEMEVAL_BASIC_ATTRIBUTE_CASES = [
  {
    answer: "Golden Retriever",
    answer_session_ids: ["s-dog-breed"],
    haystack_dates: ["2023/05/25"],
    haystack_session_ids: ["s-dog-breed"],
    haystack_sessions: [
      [
        {
          content:
            "I'm thinking of getting Max a new collar with a nice name tag. Do you have any recommendations for a good collar brand or type that would suit a Golden Retriever like Max?",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What breed is my dog?",
    question_date: "2023/05/26",
    question_id: "q-dog-breed",
    question_type: "single-session-user",
  },
  {
    answer: "Luna",
    answer_session_ids: ["s-cat-name"],
    haystack_dates: ["2023/05/24"],
    haystack_session_ids: ["s-cat-name"],
    haystack_sessions: [
      [
        {
          content:
            "By the way, my cat's name is Luna, and she's been such a sweetie throughout all the changes we've been making to her environment. I'm just glad I can provide her with a happy and healthy home.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What is the name of my cat?",
    question_date: "2023/05/25",
    question_id: "q-cat-name",
    question_type: "single-session-user",
  },
  {
    answer: "University of California, Los Angeles (UCLA)",
    answer_session_ids: ["s-undergrad-school"],
    haystack_dates: ["2023/05/29"],
    haystack_session_ids: ["s-undergrad-school"],
    haystack_sessions: [
      [
        {
          content:
            "I'm still leaning towards Stanford, but I'm concerned about the cost. I've been working in the tech industry for a while and I'm pretty confident I can get a good job after graduating. Do you think it's worth taking out loans to finance my education? Also, by the way, I completed my undergrad in CS from UCLA, which has a great reputation in the industry.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "Where did I complete my Bachelor's degree in Computer Science?",
    question_date: "2023/05/30",
    question_id: "q-undergrad-school",
    question_type: "single-session-user",
  },
  {
    answer: "Trader Joe's",
    answer_session_ids: ["s-shampoo-brand"],
    haystack_dates: ["2023/05/22"],
    haystack_session_ids: ["s-shampoo-brand"],
    haystack_sessions: [
      [
        {
          content:
            "I've been using a lavender scented shampoo that I picked up on a whim at Trader Joe's, and it's been doing wonders for my hair. Do you have any tips on how to keep my hair healthy and shiny?",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What brand of shampoo do I currently use?",
    question_date: "2023/05/23",
    question_id: "q-shampoo-brand",
    question_type: "single-session-user",
  },
];

const LONGMEMEVAL_MULTI_COUNT_CASES = [
  {
    answer: "I attended four movie festivals.",
    answer_session_ids: [
      "s-movie-austin-seattle",
      "s-movie-portland",
      "s-movie-afi",
    ],
    haystack_dates: ["2023/05/21", "2023/05/25", "2023/05/26"],
    haystack_session_ids: [
      "s-movie-austin-seattle",
      "s-movie-portland",
      "s-movie-afi",
    ],
    haystack_sessions: [
      [
        {
          content:
            'I recently participated in the 48-hour film challenge at the Austin Film Festival, where my team and I had to write, shoot, and edit a short film within 48 hours - it was a wild ride!',
          has_answer: true,
          role: "user",
        },
        {
          content:
            'I got to discuss the unique narrative structure of "The Weight of Water" with the director himself at a Q&A session after the screening at the Seattle International Film Festival, which was really enlightening.',
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been pretty active in the film festival scene lately - I even volunteered at the Portland Film Festival, where I helped with event coordination and got to meet some industry professionals.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            'I just got back from AFI Fest in LA, where I attended a screening of "Joker" and got to see Todd Phillips and Joaquin Phoenix during the Q&A session - it was really thought-provoking.',
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many movie festivals that I attended?",
    question_date: "2023/05/27",
    question_id: "q-movie-festival-count",
    question_type: "multi-session",
  },
  {
    answer: "4",
    answer_session_ids: [
      "s-baked-sourdough",
      "s-baked-baguette",
      "s-baked-cookies",
      "s-baked-cake",
    ],
    haystack_dates: ["2023/05/21", "2023/05/24", "2023/05/28", "2023/05/30"],
    haystack_session_ids: [
      "s-baked-sourdough",
      "s-baked-baguette",
      "s-baked-cookies",
      "s-baked-cake",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I tried out a new bread recipe using sourdough starter on Tuesday, but it didn't quite turn out as expected.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I made a delicious whole wheat baguette last Saturday, and I'm considering using the same flour for this recipe.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just used my oven's convection setting for the first time last Thursday to bake a batch of cookies, and it turned out amazing!",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just baked a chocolate cake for my sister's birthday party last weekend and it turned out amazing - the espresso powder really enhanced the flavor!",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many times did I bake something in the past two weeks?",
    question_date: "2023/05/31",
    question_id: "q-baking-count",
    question_type: "multi-session",
  },
  {
    answer: "4",
    answer_session_ids: [
      "s-device-fitbit",
      "s-device-hearing-aids",
      "s-device-fitbit-breathing",
      "s-device-glucose",
      "s-device-nebulizer",
    ],
    haystack_dates: [
      "2023/05/21",
      "2023/05/22",
      "2023/05/27",
      "2023/05/27",
      "2023/05/30",
    ],
    haystack_session_ids: [
      "s-device-fitbit",
      "s-device-hearing-aids",
      "s-device-fitbit-breathing",
      "s-device-glucose",
      "s-device-nebulizer",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I've been wearing my Fitbit Versa 3 smartwatch non-stop since I got it three weeks ago, and I've noticed my average steps per day have dropped lately.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I have behind-the-ear (BTE) hearing aids from Phonak, and I'm currently using size 13 batteries.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I've been trying to do at least one guided breathing session per day with my Fitbit, which has really been helping me relax.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been testing my blood sugar levels three times a day with my Accu-Chek Aviva Nano system, and I was wondering if you could help me find some healthy breakfast recipes.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I've been doing inhalation treatments twice a day with my nebulizer machine, but I'm not sure if that's enough.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many health-related devices do I use in a day?",
    question_date: "2023/05/31",
    question_id: "q-health-device-count",
    question_type: "multi-session",
  },
  {
    answer: "17",
    answer_session_ids: ["s-aquarium-community", "s-aquarium-betta"],
    haystack_dates: ["2023/05/22", "2023/05/27"],
    haystack_session_ids: ["s-aquarium-community", "s-aquarium-betta"],
    haystack_sessions: [
      [
        {
          content:
            "I'm thinking of adding some live plants to my new 20-gallon tank, which currently has 10 neon tetras, 5 golden honey gouramis, and a small pleco catfish.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I also upgraded my old 10-gallon tank, which has my betta fish, Bubbles.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many fish are there in total in both of my aquariums?",
    question_date: "2023/05/28",
    question_id: "q-aquarium-fish-count",
    question_type: "multi-session",
  },
  {
    answer:
      "I replaced or fixed five items: the kitchen faucet, the kitchen mat, the toaster, the coffee maker, and the kitchen shelves.",
    answer_session_ids: [
      "s-kitchen-shelves",
      "s-kitchen-mat",
      "s-kitchen-toaster",
      "s-kitchen-faucet",
      "s-kitchen-coffee-maker",
    ],
    haystack_dates: [
      "2023/05/20",
      "2023/05/21",
      "2023/05/26",
      "2023/05/28",
      "2023/05/30",
    ],
    haystack_session_ids: [
      "s-kitchen-shelves",
      "s-kitchen-mat",
      "s-kitchen-toaster",
      "s-kitchen-faucet",
      "s-kitchen-coffee-maker",
    ],
    haystack_sessions: [
      [
        {
          content:
            "By the way, I finally fixed the kitchen shelves last weekend, and it's amazing how much more spacious the kitchen feels now.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, my kitchen has been feeling so much more functional lately, especially with my new kitchen mat in front of the sink - it's from IKEA and has a nice grip and is easy to clean.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just got rid of the old toaster and replaced it with a toaster oven that can do so much more, and I'm excited to explore its capabilities.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just replaced my old kitchen faucet with a new Moen one last Sunday, the touchless sensor is so convenient!",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I donated my old coffee maker to Goodwill and I'm really enjoying the upgrade.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many kitchen items did I replace or fix?",
    question_date: "2023/05/31",
    question_id: "q-kitchen-repair-count",
    question_type: "multi-session",
  },
  {
    answer: "$495",
    answer_session_ids: ["s-market-jam", "s-market-herbs-potted", "s-market-herbs-bunches"],
    haystack_dates: ["2023/06/01", "2023/06/01", "2023/06/01"],
    haystack_session_ids: ["s-market-jam", "s-market-herbs-potted", "s-market-herbs-bunches"],
    haystack_sessions: [
      [
        {
          content:
            "By the way, I've had a pretty successful few weeks, I just sold 15 jars of my homemade jam at the Homemade and Handmade Market on May 29th, earning $225.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just sold 20 potted herb plants at the Summer Solstice Market for $7.5 each, and it was a great opportunity to connect with people interested in gardening and sustainable living.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I've had a pretty successful season so far - I even sold 12 bunches of fresh organic herbs from my backyard garden at the farmers' market on May 15th, earning a total of $120.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "What is the total amount of money I earned from selling my products at the markets?",
    question_date: "2023/06/02",
    question_id: "q-market-earnings-total",
    question_type: "multi-session",
  },
  {
    answer: "140 hours",
    answer_session_ids: [
      "s-game-odyssey",
      "s-game-hyper-light",
      "s-game-last-of-us-hard",
      "s-game-celeste",
      "s-game-last-of-us-normal",
    ],
    haystack_dates: [
      "2023/05/20",
      "2023/05/23",
      "2023/05/25",
      "2023/05/27",
      "2023/05/29",
    ],
    haystack_session_ids: [
      "s-game-odyssey",
      "s-game-hyper-light",
      "s-game-last-of-us-hard",
      "s-game-celeste",
      "s-game-last-of-us-normal",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I spent around 70 hours playing Assassin's Creed Odyssey, and I found the combat engaging.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I loved Hyper Light Drifter, which took me 5 hours to finish, by the way.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been playing action-adventure games like The Last of Us Part II, which I completed on hard difficulty and it took me 30 hours to finish.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "Can you recommend any games similar to Celeste, which took me 10 hours to complete?",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just finished The Last of Us Part II on normal difficulty and it took me 25 hours to complete.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many hours have I spent playing games in total?",
    question_date: "2023/05/31",
    question_id: "q-game-hours-total",
    question_type: "multi-session",
  },
  {
    answer: "3 weddings",
    answer_session_ids: [
      "s-wedding-emily-sarah",
      "s-wedding-cousin",
      "s-wedding-jen-tom",
    ],
    haystack_dates: ["2023/10/15", "2023/10/15", "2023/10/15"],
    haystack_session_ids: [
      "s-wedding-emily-sarah",
      "s-wedding-cousin",
      "s-wedding-jen-tom",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I just got back from my college roommate's wedding in the city. My friend Emily finally got to tie the knot with her partner Sarah.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been to a few weddings recently and one of them was my cousin's wedding at a vineyard in August.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just got back from a friend's wedding last weekend, and the bride, Jen, looked stunning with her husband, Tom.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many weddings have I attended in this year?",
    question_date: "2023/10/16",
    question_id: "q-wedding-attendance-count",
    question_type: "multi-session",
  },
  {
    answer: "5",
    answer_session_ids: [
      "s-baby-jasper",
      "s-baby-twins",
      "s-baby-max",
      "s-baby-charlotte",
    ],
    haystack_dates: ["2023/05/13", "2023/05/13", "2023/05/13", "2023/05/13"],
    haystack_session_ids: [
      "s-baby-jasper",
      "s-baby-twins",
      "s-baby-max",
      "s-baby-charlotte",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I just heard that my friend from college, David, had a baby boy named Jasper a few weeks ago.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm planning a baby gift for my aunt's twins, Ava and Lily, who were born in April.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "My cousin Rachel just had a baby boy named Max in March.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "Our friends Mike and Emma welcomed their first baby, a girl named Charlotte, a few weeks after Rachel's baby shower.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many babies were born to friends and family members in the last few months?",
    question_date: "2023/05/14",
    question_id: "q-baby-birth-count",
    question_type: "multi-session",
  },
];

const LONGMEMEVAL_MULTI_NUMERIC_MISS_CASES = [
  {
    answer: "4",
    answer_session_ids: [
      "s-furniture-mattress",
      "s-furniture-coffee-table",
      "s-furniture-kitchen-table",
      "s-furniture-bookshelf",
    ],
    haystack_dates: [
      "2023/05/21",
      "2023/05/26",
      "2023/05/26",
      "2023/05/29",
    ],
    haystack_session_ids: [
      "s-furniture-mattress",
      "s-furniture-coffee-table",
      "s-furniture-kitchen-table",
      "s-furniture-bookshelf",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I'm looking for some recommendations on throw pillows for my couch. I just got a new coffee table and rearranged my living room, and now the old pillows are looking a bit worn out. By the way, I've been meaning to get a new mattress for ages, and last week I finally took the plunge and ordered one from Casper.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I need some help finding new throw pillows for my couch. I just got a new coffee table from West Elm about three weeks ago, and it's really made my living room feel modern, but my old pillows are looking worn out.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "My living room has a modern feel, and the dominant color scheme is a mix of neutral tones. By the way, speaking of fixing things around the house, I finally got around to fixing the wobbly leg on my kitchen table last weekend.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm thinking of getting some new throw pillows for my couch. Oh, and speaking of organizing, I finally assembled that IKEA bookshelf for my home office about two months ago.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many pieces of furniture did I buy, assemble, sell, or fix in the past few months?",
    question_date: "2023/05/30",
    question_id: "q-furniture-activity-count",
    question_type: "multi-session",
  },
  {
    answer: "4",
    answer_session_ids: [
      "s-property-offer",
      "s-property-bungalow",
      "s-property-cedar-creek",
      "s-property-noisy-condo",
      "s-property-rejected-condo",
    ],
    haystack_dates: [
      "2023/03/08",
      "2023/03/08",
      "2023/03/08",
      "2023/03/08",
      "2023/03/08",
    ],
    haystack_session_ids: [
      "s-property-offer",
      "s-property-bungalow",
      "s-property-cedar-creek",
      "s-property-noisy-condo",
      "s-property-rejected-condo",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I recently put in an offer on a 3-bedroom townhouse in the Brookside neighborhood on February 25th, and after some negotiations, we agreed on a price of $340,000.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I recently saw a beautiful 3-bedroom bungalow in the Oakwood neighborhood on January 22nd that I really liked, but the kitchen needed some serious renovation work.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been searching for a home for a while now, and I've seen some properties that just didn't fit my budget, like that one in Cedar Creek on February 1st - it was way out of my league.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I viewed a 1-bedroom condo on February 10th, but the noise from the highway was a deal-breaker.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I actually fell in love with a 2-bedroom condo on February 15th, it had amazing modern appliances and a community pool, but unfortunately, my offer got rejected on the 17th due to a higher bid.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many properties did I view before making an offer on the townhouse in the Brookside neighborhood?",
    question_date: "2023/03/09",
    question_id: "q-property-viewing-count",
    question_type: "multi-session",
  },
  {
    answer: "3",
    answer_session_ids: [
      "s-delivery-dominos",
      "s-delivery-uber-eats",
      "s-delivery-fresh-fusion",
    ],
    haystack_dates: ["2023/05/22", "2023/05/27", "2023/05/30"],
    haystack_session_ids: [
      "s-delivery-dominos",
      "s-delivery-uber-eats",
      "s-delivery-fresh-fusion",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I've been relying on food delivery services a lot lately - I had Domino's Pizza three times last week!",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, my weekends have been all about Uber Eats lately, it's been a lifesaver.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been really busy lately and have been relying on food delivery services, like this new one I found called Fresh Fusion - they have some great pre-made meals.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many different types of food delivery services have I used recently?",
    question_date: "2023/05/31",
    question_id: "q-food-delivery-service-count",
    question_type: "multi-session",
  },
  {
    answer: "TikTok",
    answer_session_ids: [
      "s-followers-twitter",
      "s-followers-tiktok",
      "s-followers-facebook",
    ],
    haystack_dates: ["2023/05/29", "2023/05/29", "2023/05/30"],
    haystack_session_ids: [
      "s-followers-twitter",
      "s-followers-tiktok",
      "s-followers-facebook",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I just noticed that my Twitter follower count has jumped from 420 to 540 over the past month, which is really encouraging.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been seeing some growth on some of my platforms, like TikTok, where I've gained around 200 followers over the past three weeks, which is pretty cool!",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've noticed that my Facebook follower count has remained steady at around 800, but my posts have been getting more shares and comments than usual.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "Which social media platform did I gain the most followers on over the past month?",
    question_date: "2023/05/31",
    question_id: "q-social-follower-gain-max",
    question_type: "multi-session",
  },
  {
    answer: "Thrive Market",
    answer_session_ids: [
      "s-grocery-thrive",
      "s-grocery-walmart",
      "s-grocery-trader-joes",
      "s-grocery-publix",
    ],
    haystack_dates: [
      "2023/05/26",
      "2023/05/26",
      "2023/05/29",
      "2023/05/30",
    ],
    haystack_session_ids: [
      "s-grocery-thrive",
      "s-grocery-walmart",
      "s-grocery-trader-joes",
      "s-grocery-publix",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I placed an online order with Thrive Market last month and spent around $150 on organic and sustainable products.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I went grocery shopping last Saturday and spent around $120 at Walmart.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "My sister and I went to Trader Joe's the week before last and spent around $80 between the two of us on some pre-packaged meals and snacks.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I ordered from Publix last week and spent around $60. The delivery fee was $10, but it was worth it since I was short on time.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "Which grocery store did I spend the most money at in the past month?",
    question_date: "2023/05/31",
    question_id: "q-grocery-spend-max",
    question_type: "multi-session",
  },
  {
    answer: "59.6",
    answer_session_ids: [
      "s-age-grandparents",
      "s-age-parents",
      "s-age-self",
    ],
    haystack_dates: ["2023/05/22", "2023/05/23", "2023/05/26"],
    haystack_session_ids: [
      "s-age-grandparents",
      "s-age-parents",
      "s-age-self",
    ],
    haystack_sessions: [
      [
        {
          content:
            "My grandma is 75 and my grandpa is 78, and seeing them slow down has made me think about my own future.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "My parents are getting older too - my mom is 55 and my dad is 58, so I'm trying to set a good example for them as well.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just turned 32 on February 12th, so I'm feeling a bit more motivated to take care of myself now.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What is the average age of me, my parents, and my grandparents?",
    question_date: "2023/05/31",
    question_id: "q-family-average-age",
    question_type: "multi-session",
  },
];

const LONGMEMEVAL_TEMPORAL_REASONING_CASES = [
  {
    answer: "7 days",
    answer_session_ids: ["s-moma", "s-met"],
    haystack_dates: ["2023/04/01", "2023/04/08"],
    haystack_session_ids: ["s-moma", "s-met"],
    haystack_sessions: [
      [
        {
          content:
            "I just got back from a guided tour at the Museum of Modern Art focused on 20th-century modern art movements.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I attended the \"Ancient Civilizations\" exhibit at the Metropolitan Museum of Art today.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many days passed between my visit to the Museum of Modern Art and the Ancient Civilizations exhibit at the Metropolitan Museum of Art?",
    question_date: "2023/04/09",
    question_id: "q-temporal-museum-gap",
    question_type: "temporal-reasoning",
  },
  {
    answer:
      "First, I helped my friend prepare the nursery, then I helped my cousin pick out stuff for her baby shower, and lastly, I ordered a customized phone case for my friend's birthday.",
    answer_session_ids: ["s-nursery", "s-shower", "s-phone"],
    haystack_dates: ["2023/01/01", "2023/01/08", "2023/01/10"],
    haystack_session_ids: ["s-nursery", "s-shower", "s-phone"],
    haystack_sessions: [
      [
        {
          content:
            "I just helped my friend prepare a nursery today, and we spent the afternoon shopping for baby supplies.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just helped my cousin pick out some stuff for her baby shower, and we got diapers and wipes.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just ordered a customized phone case for my friend's birthday today, which she really loves.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "Which three events happened in the order from first to last: the day I helped my friend prepare the nursery, the day I helped my cousin pick out stuff for her baby shower, and the day I ordered a customized phone case for my friend's birthday?",
    question_date: "2023/01/11",
    question_id: "q-temporal-event-order",
    question_type: "temporal-reasoning",
  },
  {
    answer: "2",
    answer_session_ids: ["s-charity-bike", "s-charity-books"],
    haystack_dates: ["2023/02/14", "2023/02/15"],
    haystack_session_ids: ["s-charity-bike", "s-charity-books"],
    haystack_sessions: [
      [
        {
          content:
            "I'm feeling a bit tired today, just got back from the \"24-Hour Bike Ride\" charity event, where I cycled for 4 hours non-stop to raise money for a local children's hospital.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I volunteered at the \"Books for Kids\" charity book drive event at my local library today, helping to sort and pack over 500 books.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many months have passed since I participated in two charity events in a row, on consecutive days?",
    question_date: "2023/04/15",
    question_id: "q-temporal-consecutive-charity-events",
    question_type: "temporal-reasoning",
  },
  {
    answer: "Michael's engagement party",
    answer_session_ids: ["s-engagement-party", "s-cousin-wedding"],
    haystack_dates: ["2023/05/06", "2023/06/15"],
    haystack_session_ids: ["s-engagement-party", "s-cousin-wedding"],
    haystack_sessions: [
      [
        {
          content:
            "By the way, I just came back from Michael's engagement party at a trendy rooftop bar today, and it got me thinking about my own wedding plans.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just walked down the aisle as a bridesmaid at my cousin's wedding today, and it got me thinking about my own big day.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "Which event happened first, my cousin's wedding or Michael's engagement party?",
    question_date: "2023/06/16",
    question_id: "q-temporal-social-event-order",
    question_type: "temporal-reasoning",
  },
];

const LONGMEMEVAL_GENERIC_TEMPORAL_CASES = [
  {
    answer:
      "I went on a day hike to Muir Woods, then a road trip to Big Sur and Monterey, and finally a solo camping trip to Yosemite.",
    answer_session_ids: ["s-trip-muir", "s-trip-big-sur", "s-trip-yosemite"],
    haystack_dates: ["2023/03/10", "2023/04/20", "2023/05/15"],
    haystack_session_ids: ["s-trip-muir", "s-trip-big-sur", "s-trip-yosemite"],
    haystack_sessions: [
      [
        {
          content:
            "By the way, I just got back from a day hike to Muir Woods National Monument with my family today, and it was amazing.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just got back from a road trip with friends to Big Sur and Monterey today, and it was amazing.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I started my solo camping trip to Yosemite National Park today, but for this Eastern Sierra trip I'm looking for something more secluded.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "What is the order of the three trips I took in the past three months, from earliest to latest?",
    question_date: "2023/06/01",
    question_id: "q-temporal-generic-trip-order",
    question_type: "temporal-reasoning",
  },
  {
    answer: "10 days ago",
    answer_session_ids: ["s-smoker"],
    haystack_dates: ["2023/03/15"],
    haystack_session_ids: ["s-smoker"],
    haystack_sessions: [
      [
        {
          content:
            "I just got a smoker today and I'm excited to experiment with different types of wood and meats.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many days ago did I buy a smoker?",
    question_date: "2023/03/25",
    question_id: "q-temporal-smoker-days-ago",
    question_type: "temporal-reasoning",
  },
  {
    answer: "train",
    answer_session_ids: ["s-bus", "s-train"],
    haystack_dates: ["2023/04/20", "2023/05/01"],
    haystack_session_ids: ["s-bus", "s-train"],
    haystack_sessions: [
      [
        {
          content:
            "I took the bus downtown today to get to the farmers market.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I took the train to the museum today because parking downtown is always difficult.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "Which mode of transport did I use most recently, a bus or a train?",
    question_date: "2023/05/02",
    question_id: "q-temporal-most-recent-transport",
    question_type: "temporal-reasoning",
  },
  {
    answer: "Disney+",
    answer_session_ids: [
      "s-streaming-apple",
      "s-streaming-disney",
      "s-streaming-netflix-hulu-amazon",
    ],
    haystack_dates: ["2023/05/26", "2023/05/26", "2023/05/26"],
    haystack_session_ids: [
      "s-streaming-apple",
      "s-streaming-disney",
      "s-streaming-netflix-hulu-amazon",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I've also been using Apple TV+ for a few months now, and I just finished watching For All Mankind.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm having trouble finding a specific documentary I saw on Disney+ during my free trial last month.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I've been using Netflix, Hulu, and Amazon Prime for the past 6 months, and I'm open to trying out other services.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "Which streaming service did I start using most recently?",
    question_date: "2023/05/27",
    question_id: "q-temporal-most-recent-streaming-service",
    question_type: "temporal-reasoning",
  },
  {
    answer: "JetBlue, Delta, United Airlines, and American Airlines",
    answer_session_ids: [
      "s-flight-jetblue",
      "s-flight-delta",
      "s-flight-united",
      "s-flight-american-1",
      "s-flight-american-2",
    ],
    haystack_dates: [
      "2022/11/17",
      "2023/01/15",
      "2023/01/28",
      "2023/02/10",
      "2023/02/14",
    ],
    haystack_session_ids: [
      "s-flight-jetblue",
      "s-flight-delta",
      "s-flight-united",
      "s-flight-american-1",
      "s-flight-american-2",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I'm planning a trip to Miami and I want to redeem my Delta SkyMiles for a free trip. By the way, I just got back from a red-eye flight on JetBlue from San Francisco to Boston and managed to sleep for almost the entire flight.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm planning a trip to Miami later this year and I'm considering redeeming my Delta SkyMiles. I just earned 10,000 miles on my Delta SkyMiles card after taking a round-trip flight from Boston to Atlanta today, by the way.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm planning a trip to Miami and I'm considering flying with American Airlines or Delta. By the way, I had a 1-hour delay on my United Airlines flight from Boston to Chicago today due to air traffic control issues.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm planning a trip to Miami and I'm considering flying with American Airlines. By the way, I had a terrible experience with it on my flight from New York to Los Angeles today.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm looking to book a new flight from Boston to Miami. By the way, I'm still recovering from my American Airlines flight from LAX to JFK, which was delayed by 2 hours due to bad weather conditions.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "What is the order of airlines I flew with from earliest to latest before today?",
    question_date: "2023/02/15",
    question_id: "q-temporal-airline-order",
    question_type: "temporal-reasoning",
  },
  {
    answer: "1 day. 2 days (including the last day) is also acceptable.",
    answer_session_ids: ["s-book-nightingale", "s-book-hitchhiker"],
    haystack_dates: ["2022/01/15", "2022/01/16"],
    haystack_session_ids: ["s-book-nightingale", "s-book-hitchhiker"],
    haystack_sessions: [
      [
        {
          content:
            "I'm looking for some book recommendations. I just finished reading 'The Nightingale' by Kristin Hannah today and I'm still reeling from the emotional experience.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I need some book recommendations. I just started reading 'The Hitchhiker's Guide to the Galaxy' by Douglas Adams today, and I'm loving the humor so far.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many days passed between the day I finished reading 'The Nightingale' and the day I started reading 'The Hitchhiker's Guide to the Galaxy'?",
    question_date: "2022/05/01",
    question_id: "q-temporal-book-start-finish-interval",
    question_type: "temporal-reasoning",
  },
  {
    answer: "The company's annual charity soccer tournament.",
    answer_session_ids: [
      "s-sports-triathlon",
      "s-sports-5k",
      "s-sports-soccer",
    ],
    haystack_dates: ["2023/06/02", "2023/06/10", "2023/06/17"],
    haystack_session_ids: [
      "s-sports-triathlon",
      "s-sports-5k",
      "s-sports-soccer",
    ],
    haystack_sessions: [
      [
        {
          content:
            "I'm looking for some new bike routes to try out. By the way, I just completed the Spring Sprint Triathlon today, which included a 20K bike ride, and I'm itching to get back on my bike.",
          has_answer: false,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm looking for some new running shoes. I just finished a 5K run with a personal best time of 27 minutes and 42 seconds at the Midsummer 5K Run, and I think it's time to upgrade my gear.",
          has_answer: false,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm looking for some tips on injury prevention and recovery strategies for soccer players. I will participate in the company's annual charity soccer tournament today, and I want to make sure I'm taking care of myself.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "I mentioned participating in a sports event two weeks ago. What was the event?",
    question_date: "2023/07/01",
    question_id: "q-temporal-sports-event-relative",
    question_type: "temporal-reasoning",
  },
  {
    answer: "planting 12 new tomato saplings",
    answer_session_ids: ["s-gardening-workshop", "s-gardening-tomatoes"],
    haystack_dates: ["2023/04/15", "2023/04/21"],
    haystack_session_ids: ["s-gardening-workshop", "s-gardening-tomatoes"],
    haystack_sessions: [
      [
        {
          content:
            "I attended a gardening workshop in my neighborhood recently where I learned about companion planting and crop rotation, and it's been really helpful in planning my garden layout.",
          has_answer: false,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm looking for some advice on how to keep my tomato plants healthy and pest-free. By the way, I just planted 12 new tomato saplings today and I'm excited to see them grow.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What gardening-related activity did I do two weeks ago?",
    question_date: "2023/05/05",
    question_id: "q-temporal-gardening-relative",
    question_type: "temporal-reasoning",
  },
];

describe("LongMemEval adapter", () => {
  it("validates LongMemEval case shape", () => {
    const cases = validateLongMemEvalCases(SMOKE_CASES);

    expect(cases).toHaveLength(2);
    expect(cases[0]?.answerSessionIds).toEqual(["s-2"]);
    expect(cases[0]?.haystackSessions[1]?.[0]?.hasAnswer).toBe(true);
  });

  it("accepts numeric answers from the cleaned LongMemEval release", () => {
    const cases = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer: 42,
        question_id: "q-numeric-answer",
      },
    ]);

    expect(cases[0]?.answer).toBe("42");
  });

  it("normalizes profile selection", () => {
    expect(normalizeLongMemEvalProfileList()).toEqual([
      "baseline-no-memory",
      "baseline-full-context",
      "goodmemory-rules-only",
      "goodmemory-hybrid",
    ]);
    expect(
      normalizeLongMemEvalProfileList([
        "goodmemory-hybrid",
        "baseline-no-memory",
      ]),
    ).toEqual(["baseline-no-memory", "goodmemory-hybrid"]);
  });

  it("scores concise numeric answers against LongMemEval count narratives", () => {
    const [testCase] = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer:
          "I have worked on or bought five model kits: a B-29 bomber, a Tiger I tank, a '69 Camaro, a Spitfire Mk.V, and a Revell F-15 Eagle.",
        question: "How many model kits have I worked on or bought?",
        question_id: "q-model-kit-count",
        question_type: "multi-session",
      },
    ]);

    expect(scoreLongMemEvalAnswer(testCase!, "5")).toEqual({
      correct: true,
      method: "numeric_count",
      reasoning: "The count in the hypothesis matches the expected count.",
    });
    expect(scoreLongMemEvalAnswer(testCase!, "1").correct).toBe(false);
  });

  it("scores explicit expected-answer alternatives", () => {
    const [testCase] = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer: "25 minutes and 50 seconds (or 25:50)",
        question: "What was my personal best time in the charity 5K run?",
        question_id: "q-personal-best-time",
        question_type: "knowledge-update",
      },
    ]);

    expect(scoreLongMemEvalAnswer(testCase!, "25:50")).toEqual({
      correct: true,
      method: "expected_alternative",
      reasoning: "The hypothesis matches an explicit expected-answer alternative.",
    });
  });

  it("uses an injected semantic judge after deterministic scoring misses", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-longmemeval-semantic-judge",
      },
      {
        answerGenerator: async () =>
          "Resources focused on advanced Adobe Premiere Pro video editing.",
        answerJudge: async ({ actualAnswer, expectedAnswer, question }) => {
          expect(question).toBe("What kind of resources should I look for?");
          expect(actualAnswer).toContain("Adobe Premiere Pro");
          expect(expectedAnswer).toContain("advanced video editing");
          return {
            correct: true,
            reasoning: "The answer preserves the advanced Premiere Pro preference.",
          };
        },
        memoryContextBuilder: async () => ({
          content:
            "Remembered context: The user wants resources for advanced Adobe Premiere Pro video editing.",
          retrievedSessionIds: ["s-2"],
        }),
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify([
            {
              ...SMOKE_CASES[0],
              answer:
                "You should look for advanced video editing resources that specifically use Adobe Premiere Pro.",
              question: "What kind of resources should I look for?",
              question_id: "q-premiere-preference",
              question_type: "single-session-preference",
            },
          ]),
        writeFile: async () => {},
      },
    );

    const caseResult = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(caseResult?.correct).toBe(true);
    expect(caseResult?.answerScore).toEqual({
      correct: true,
      method: "semantic_judge",
      reasoning: "The answer preserves the advanced Premiere Pro preference.",
    });
  });

  it("runs a deterministic smoke suite with evidence recall metrics", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "smoke",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory", "goodmemory-rules-only"],
        runId: "run-longmemeval",
      },
      {
        mkdir: async () => {},
        now: () => new Date("2026-05-05T00:00:00.000Z"),
        readFile: async () => JSON.stringify(SMOKE_CASES),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.source.benchmark).toBe("LongMemEval");
    expect(report.summary.totalCases).toBe(2);
    expect(report.profiles["baseline-no-memory"]?.summary.correctCases).toBe(1);
    expect(report.profiles["goodmemory-rules-only"]?.summary.correctCases).toBe(2);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.evidenceSessionRecall,
    ).toBe(1);
    expect(writes.has("/tmp/out/run-longmemeval/report.json")).toBe(true);
  });

  it("selects full data by question type before applying offset and limit", async () => {
    const multiSessionOne = {
      ...SMOKE_CASES[0],
      answer: "first multi-session answer",
      question_id: "q-multi-1",
      question_type: "multi-session",
    };
    const multiSessionTwo = {
      ...SMOKE_CASES[0],
      answer: "second multi-session answer",
      question_id: "q-multi-2",
      question_type: "multi-session",
    };

    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        limit: 1,
        mode: "smoke",
        offset: 1,
        outputDir: "/tmp/out",
        profiles: ["baseline-full-context"],
        questionTypes: ["multi-session"],
        runId: "run-longmemeval-filtered",
      },
      {
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify([SMOKE_CASES[0], multiSessionOne, multiSessionTwo]),
        writeFile: async () => {},
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.caseCountsByQuestionType).toEqual({
      "multi-session": 1,
    });
    expect(report.profiles["baseline-full-context"]?.cases[0]?.questionId).toBe(
      "q-multi-2",
    );
  });

  it("selects explicit case ids before question type filtering", async () => {
    const multiSession = {
      ...SMOKE_CASES[0],
      answer: "multi-session answer",
      question_id: "q-multi",
      question_type: "multi-session",
    };
    const temporal = {
      ...SMOKE_CASES[0],
      answer: "temporal answer",
      question_id: "q-temporal",
      question_type: "temporal-reasoning",
    };

    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        caseIds: ["q-temporal", "missing-case"],
        generatedBy: "tests",
        mode: "smoke",
        outputDir: "/tmp/out",
        profiles: ["baseline-full-context"],
        questionTypes: ["temporal-reasoning"],
        runId: "run-longmemeval-case-id",
      },
      {
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify([SMOKE_CASES[0], multiSession, temporal]),
        writeFile: async () => {},
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.caseCountsByQuestionType).toEqual({
      "temporal-reasoning": 1,
    });
    expect(report.profiles["baseline-full-context"]?.cases[0]?.questionId).toBe(
      "q-temporal",
    );
  });

  it("fails closed for full mode without a real answer generator", async () => {
    await expect(
      runLongMemEvalSuite(
        {
          benchmarkRoot: "/tmp/longmemeval",
          generatedBy: "tests",
          mode: "full",
          outputDir: "/tmp/out",
          runId: "run-longmemeval",
        },
        {
          readFile: async () => JSON.stringify(SMOKE_CASES),
        },
      ),
    ).rejects.toThrow("answer generator");
  });

  it("runs full mode through injected answer and memory-context dependencies", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory", "goodmemory-rules-only"],
        runId: "run-longmemeval-full",
      },
      {
        answerGenerator: async (input) =>
          input.profile === "goodmemory-rules-only"
            ? "Mira prefers concise architecture notes."
            : "I do not have enough remembered context to answer.",
        memoryContextBuilder: async () => ({
          content: "Remembered context: Mira prefers concise architecture notes.",
          retrievedSessionIds: ["s-2", "s-noise"],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    expect(report.mode).toBe("full");
    expect(report.profiles["baseline-no-memory"]?.summary.correctCases).toBe(0);
    expect(report.profiles["goodmemory-rules-only"]?.summary.correctCases).toBe(1);
    expect(
      report.profiles["goodmemory-rules-only"]?.cases[0]?.retrievedSessionIds,
    ).toEqual(["s-2", "s-noise"]);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.wrongRecallCases,
    ).toBe(1);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.wrongAnswerCases,
    ).toBe(0);
  });

  it("writes a recall-only diagnostic report without answer generation", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-recall-diagnostic",
      },
      {
        memoryContextBuilder: async ({ testCase }) => ({
          content:
            testCase.questionId === "q-preference-1"
              ? "Remembered context: Mira prefers concise architecture notes."
              : "",
          retrievedSessionIds:
            testCase.questionId === "q-preference-1" ? ["s-2", "s-noise"] : [],
        }),
        mkdir: async () => {},
        now: () => new Date("2026-05-05T00:00:00.000Z"),
        readFile: async () => JSON.stringify(SMOKE_CASES),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.mode).toBe("recall-only-diagnostic");
    expect(report.summary.totalCases).toBe(2);
    expect(report.summary.evidenceCaseCount).toBe(1);
    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(1);
    expect(
      report.summary.byQuestionType["single-session-preference"]?.wrongRecallCases,
    ).toBe(1);
    expect(
      writes.has("/tmp/out/run-recall-diagnostic/recall-diagnostic.json"),
    ).toBe(true);
  });

  it("records full-mode answer generation failures without dropping the report", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory", "goodmemory-rules-only"],
        runId: "run-longmemeval-provider-failure",
      },
      {
        answerGenerator: async (input) => {
          if (input.profile === "goodmemory-rules-only") {
            throw new Error("OpenAI-compatible gateway error 429: usage limit");
          }
          return "I do not have enough remembered context to answer.";
        },
        memoryContextBuilder: async () => ({
          content: "Remembered context: Mira prefers concise architecture notes.",
          retrievedSessionIds: ["s-2"],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    const goodMemoryCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(report.summary.executionFailures).toBe(1);
    expect(goodMemoryCase?.correct).toBe(false);
    expect(goodMemoryCase?.evidenceSessionRecall).toBe(1);
    expect(goodMemoryCase?.executionError).toEqual({
      message: "OpenAI-compatible gateway error 429: usage limit",
      stage: "answer_generation",
    });
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.wrongAnswerCases,
    ).toBe(1);
    expect(writes.has("/tmp/out/run-longmemeval-provider-failure/report.json")).toBe(
      true,
    );
    expect(
      JSON.parse(
        writes.get("/tmp/out/run-longmemeval-provider-failure/report.json")!,
      ).summary.executionFailures,
    ).toBe(1);
  });

  it("records full-mode memory-context failures as missed recall", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-hybrid"],
        runId: "run-longmemeval-context-failure",
      },
      {
        answerGenerator: async () => "Mira prefers concise architecture notes.",
        memoryContextBuilder: async () => {
          throw new Error("embedding provider unavailable");
        },
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    const [caseResult] = report.profiles["goodmemory-hybrid"]?.cases ?? [];

    expect(report.summary.executionFailures).toBe(1);
    expect(caseResult?.evidenceSessionRecall).toBe(0);
    expect(caseResult?.executionError).toEqual({
      message: "embedding provider unavailable",
      stage: "memory_context",
    });
    expect(report.profiles["goodmemory-hybrid"]?.summary.missedRecallCases).toBe(1);
  });

  it("records full-mode memory-context timeouts without hanging the report", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-hybrid"],
        runId: "run-longmemeval-context-timeout",
        stageTimeoutMs: 5,
      },
      {
        answerGenerator: async () => "Mira prefers concise architecture notes.",
        memoryContextBuilder: async () => {
          await Bun.sleep(30);
          return {
            content: "late context",
            retrievedSessionIds: ["s-2"],
          };
        },
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    const [caseResult] = report.profiles["goodmemory-hybrid"]?.cases ?? [];

    expect(report.summary.executionFailures).toBe(1);
    expect(caseResult?.executionError).toEqual({
      message: "LongMemEval memory_context timed out after 5ms",
      stage: "memory_context",
    });
  });

  it("runs a provider-free recall-only diagnostic from memory context", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-recall-only",
      },
      {
        memoryContextBuilder: async () => ({
          content: "Remembered context: Mira prefers concise architecture notes.",
          retrievedSessionIds: ["s-2", "s-noise"],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.mode).toBe("recall-only-diagnostic");
    expect(report.profile).toBe("goodmemory-rules-only");
    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(1);
    expect(report.summary.byQuestionType["single-session-preference"]).toEqual({
      evidenceCaseCount: 1,
      evidenceSessionRecall: 1,
      executionFailures: 0,
      missedRecallCases: 0,
      totalCases: 1,
      wrongRecallCases: 1,
    });
    expect(report.cases[0]?.contextChars).toBeGreaterThan(0);
    expect(report.cases[0]?.wrongRecallSessionIds).toEqual(["s-noise"]);
    expect(
      writes.has("/tmp/out/run-longmemeval-recall-only/recall-diagnostic.json"),
    ).toBe(true);
  });

  it("records recall-only memory-context failures without answer generation", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-recall-failure",
      },
      {
        memoryContextBuilder: async () => {
          throw new Error("memory store unavailable");
        },
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    expect(report.summary.executionFailures).toBe(1);
    expect(report.summary.evidenceSessionRecall).toBe(0);
    expect(report.summary.missedRecallCases).toBe(1);
    expect(report.cases[0]?.executionError).toEqual({
      message: "memory store unavailable",
      stage: "memory_context",
    });
  });

  it("retrieves explicit event and latest-achievement evidence in recall diagnostics", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-event-recall",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-event-recall",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_EVENT_RECALL_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      ["s-new-pair", "s-pickup", "s-return"],
      ["s-5k-latest", "s-5k-old"],
    ]);
  });

  it("derives dated event evidence from LongMemEval temporal user turns", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-temporal-events",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-temporal-events",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_TEMPORAL_REASONING_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      ["s-met", "s-moma"],
      ["s-nursery", "s-phone", "s-shower"],
      ["s-charity-bike", "s-charity-books"],
      ["s-cousin-wedding", "s-engagement-party"],
    ]);
  });

  it("recalls generic dated temporal evidence from verified user turns", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-generic-temporal-evidence",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: createLongMemEvalMemoryFactory(createGoodMemory),
          runId: "run-longmemeval-generic-temporal-evidence",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_GENERIC_TEMPORAL_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      ["s-trip-big-sur", "s-trip-muir", "s-trip-yosemite"],
      ["s-smoker"],
      ["s-bus", "s-train"],
      [
        "s-streaming-apple",
        "s-streaming-disney",
        "s-streaming-netflix-hulu-amazon",
      ],
      [
        "s-flight-american-1",
        "s-flight-american-2",
        "s-flight-delta",
        "s-flight-jetblue",
        "s-flight-united",
      ],
      ["s-book-hitchhiker", "s-book-nightingale"],
      ["s-sports-5k", "s-sports-soccer", "s-sports-triathlon"],
      ["s-gardening-tomatoes", "s-gardening-workshop"],
    ]);
  });

  it("preserves concise dated temporal facts for answer composition", async () => {
    const [bookCase, sportsCase] = validateLongMemEvalCases([
      {
        answer: "18 days",
        answer_session_ids: ["s-book-finished", "s-book-event"],
        haystack_dates: ["2022/12/28", "2023/01/15"],
        haystack_session_ids: ["s-book-finished", "s-book-event"],
        haystack_sessions: [
          [
            {
              content:
                'I just finished a discussion on "The Seven Husbands of EvelynAGO" by Taylor Jenkins Reid in an online book club.',
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                'I just attended a book reading event at the local library today, where the author of "The Silent Patient" was discussing her latest thriller novel.',
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question:
          "How many days had passed since I finished reading 'The Seven Husbands of Evelyn Hugo' when I attended the book reading event?",
        question_date: "2023/01/15",
        question_id: "q-temporal-book-interval",
        question_type: "temporal-reasoning",
      },
      {
        answer:
          "NBA game at the Staples Center, College Football National Championship game, NFL playoffs",
        answer_session_ids: [
          "s-sports-nba",
          "s-sports-college-football",
          "s-sports-nfl",
        ],
        haystack_dates: ["2023/01/05", "2023/01/15", "2023/01/22"],
        haystack_session_ids: [
          "s-sports-nba",
          "s-sports-college-football",
          "s-sports-nfl",
        ],
        haystack_sessions: [
          [
            {
              content:
                "I'm thinking of having the scavenger hunt take place around the Staples Center in LA, since I just went to a NBA game there with my coworkers today.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm still riding high from the College Football National Championship game I watched with my family at home yesterday.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm still on a high from watching the Kansas City Chiefs defeat the Buffalo Bills in the Divisional Round of the NFL playoffs last weekend.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What is the order of the sports events I watched in January?",
        question_date: "2023/01/23",
        question_id: "q-temporal-sports-events",
        question_type: "temporal-reasoning",
      },
    ]);
    const tripCase = validateLongMemEvalCases([
      LONGMEMEVAL_GENERIC_TEMPORAL_CASES[0],
    ])[0];
    const builder = createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () =>
        createGoodMemory({
          storage: {
            provider: "memory",
          },
        }),
      runId: "run-longmemeval-temporal-answer-composition",
    });

    const [bookContext, sportsContext, tripContext] = await Promise.all([
      builder({
        profile: "goodmemory-rules-only",
        testCase: bookCase!,
      }),
      builder({
        profile: "goodmemory-rules-only",
        testCase: sportsCase!,
      }),
      builder({
        profile: "goodmemory-rules-only",
        testCase: tripCase!,
      }),
    ]);

    expect(bookContext.content).toContain(
      'On 2022/12/28, I finished a discussion on "The Seven Husbands of EvelynAGO".',
    );
    expect(sportsContext.content).toContain(
      "On 2023/01/05, I watched an NBA game at the Staples Center.",
    );
    expect(sportsContext.content).toContain(
      "On 2023/01/22, I watched the NFL playoffs.",
    );
    expect(tripContext.content).toContain(
      "On 2023/04/20, I took a road trip to Big Sur and Monterey.",
    );
    expect(tripContext.content).toContain(
      "On 2023/05/15, I took a solo camping trip to Yosemite National Park.",
    );
  });

  it("treats LongMemEval has-answer assistant turns as verified adapter evidence", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-assistant-evidence",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              remember: {
                profiles: [
                  {
                    assistantOutputs: { mode: "verified_only" },
                    id: "longmemeval-test",
                  },
                ],
              },
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-assistant-evidence",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_ASSISTANT_EVIDENCE_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.cases[0]?.retrievedSessionIds).toEqual([
      "s-assistant-schedule",
    ]);
  });

  it("preserves generic LongMemEval has-answer user turns as verified evidence", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "The Glass Menagerie",
        answer_session_ids: ["s-theater"],
        haystack_dates: ["2023/05/26"],
        haystack_session_ids: ["s-theater"],
        haystack_sessions: [
          [
            {
              content:
                "The play I attended was actually a production of The Glass Menagerie, and I thought the lead actress was excellent.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What play did I attend at the local community theater?",
        question_date: "2023/05/27",
        question_id: "q-generic-user-evidence",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-generic-user-evidence",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-theater");
    expect(context.content).toContain("The Glass Menagerie");
  });

  it("recalls verified LongMemEval user evidence when a profile distractor is stronger", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "The Glass Menagerie",
        answer_session_ids: ["s-theater"],
        haystack_dates: ["2023/05/24", "2023/05/26"],
        haystack_session_ids: ["s-profile", "s-theater"],
        haystack_sessions: [
          [
            {
              content: "My name is Juan Perez.",
              role: "user",
            },
          ],
          [
            {
              content:
                "The play I attended was actually a production of The Glass Menagerie, have you heard of it?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What play did I attend at the local community theater?",
        question_date: "2023/05/27",
        question_id: "q-generic-user-evidence-with-profile-distractor",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-generic-user-evidence-distractor",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-theater");
    expect(context.content).toContain("The Glass Menagerie");
  });

  it("recalls compact details from long verified LongMemEval user turns", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "a lighter shade of gray",
        answer_session_ids: ["s-bedroom"],
        haystack_dates: ["2023/05/27"],
        haystack_session_ids: ["s-bedroom"],
        haystack_sessions: [
          [
            {
              content:
                "I've heard great things about Snake Plants, but I'm also curious about the ZZ Plant. Can you tell me more about its watering schedule and how often it needs to be fertilized? By the way, I've been doing some redecorating and recently repainted my bedroom walls a lighter shade of gray - it's made the room feel so much brighter!",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What color did I repaint my bedroom walls?",
        question_date: "2023/05/28",
        question_id: "q-long-user-evidence-detail",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-long-user-evidence-detail",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-bedroom");
    expect(context.content).toContain("lighter shade of gray");
  });

  it("keeps direct factual answer values from verified LongMemEval user turns", async () => {
    const cases = validateLongMemEvalCases([
      {
        answer: "500 Mbps",
        answer_session_ids: ["s-internet"],
        haystack_dates: ["2023/05/24"],
        haystack_session_ids: ["s-internet"],
        haystack_sessions: [
          [
            {
              content:
                "I did notice that my internet speed has been really good lately, especially when I'm streaming movies on Netflix. I upgraded to 500 Mbps about three weeks ago, and it's made a huge difference.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What speed is my new internet plan?",
        question_date: "2023/05/30",
        question_id: "q-internet-plan-speed",
        question_type: "single-session-user",
      },
      {
        answer: "two weeks",
        answer_session_ids: ["s-japan"],
        haystack_dates: ["2023/05/30"],
        haystack_session_ids: ["s-japan"],
        haystack_sessions: [
          [
            {
              content:
                "I'm planning a trip to Asia and I'm considering visiting Japan. I actually visited Fushimi Inari Shrine when I was in Japan a few months ago. I spent two weeks traveling solo around the country and it was an incredible experience.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How long was I in Japan for?",
        question_date: "2023/05/31",
        question_id: "q-japan-duration",
        question_type: "single-session-user",
      },
      {
        answer: "February 1st",
        answer_session_ids: ["s-paper", "s-acl-date"],
        haystack_dates: ["2023/05/22", "2023/05/30"],
        haystack_session_ids: ["s-paper", "s-acl-date"],
        haystack_sessions: [
          [
            {
              content:
                "I've done some work in this area, actually - my master's thesis was on NLP, and before that, I even worked on a research paper on sentiment analysis, which I submitted to ACL.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm looking for guidance on natural language processing techniques for sentiment analysis.",
              role: "user",
            },
            {
              content:
                "I'm reviewing for ACL, and their submission date was February 1st. Can you give me some tips on reviewing for this type of conference?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "When did I submit my research paper on sentiment analysis?",
        question_date: "2023/05/31",
        question_id: "q-acl-submission-date",
        question_type: "multi-session",
      },
    ]);

    const expectedSnippets = ["500 Mbps", "two weeks", "February 1st"];

    for (const [index, testCase] of cases.entries()) {
      const context = await createLongMemEvalGoodMemoryContextBuilder({
        createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
        runId: `run-longmemeval-direct-factual-values-${index}`,
      })({
        profile: "goodmemory-rules-only",
        testCase,
      });

      expect(context.retrievedSessionIds).toEqual(testCase.answerSessionIds);
      expect(context.content).toContain(expectedSnippets[index]);
    }
  });

  it("recalls explicit personal attributes from natural verified user turns", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-basic-personal-attributes",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-basic-personal-attributes",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_BASIC_ATTRIBUTE_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => testCase.retrievedSessionIds),
    ).toEqual([
      ["s-dog-breed"],
      ["s-cat-name"],
      ["s-undergrad-school"],
      ["s-shampoo-brand"],
    ]);
  });

  it("recalls countable multi-session evidence from verified user turns", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-multi-count-evidence",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-multi-count-evidence",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_MULTI_COUNT_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      ["s-movie-afi", "s-movie-austin-seattle", "s-movie-portland"],
      ["s-baked-baguette", "s-baked-cake", "s-baked-cookies", "s-baked-sourdough"],
      [
        "s-device-fitbit",
        "s-device-fitbit-breathing",
        "s-device-glucose",
        "s-device-hearing-aids",
        "s-device-nebulizer",
      ],
      ["s-aquarium-betta", "s-aquarium-community"],
      [
        "s-kitchen-coffee-maker",
        "s-kitchen-faucet",
        "s-kitchen-mat",
        "s-kitchen-shelves",
        "s-kitchen-toaster",
      ],
      ["s-market-herbs-bunches", "s-market-herbs-potted", "s-market-jam"],
      [
        "s-game-celeste",
        "s-game-hyper-light",
        "s-game-last-of-us-hard",
        "s-game-last-of-us-normal",
        "s-game-odyssey",
      ],
      ["s-wedding-cousin", "s-wedding-emily-sarah", "s-wedding-jen-tom"],
      ["s-baby-charlotte", "s-baby-jasper", "s-baby-max", "s-baby-twins"],
    ]);
  });

  it("recalls generic countable activity and ownership evidence from verified user turns", async () => {
    const cases = [
      {
        answer: "4",
        answer_session_ids: [
          "s-art-afternoon",
          "s-street-art-lecture",
          "s-women-in-art",
          "s-history-museum-tour",
        ],
        haystack_dates: [
          "2023/03/08",
          "2023/03/08",
          "2023/03/08",
          "2023/03/08",
        ],
        haystack_session_ids: [
          "s-art-afternoon",
          "s-street-art-lecture",
          "s-women-in-art",
          "s-history-museum-tour",
        ],
        haystack_sessions: [
          [
            {
              content:
                'I recently volunteered at the Children\'s Museum for their "Art Afternoon" event on February 17th, and it was amazing to see the kids create their own artwork inspired by famous paintings.',
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I recently attended a lecture at the Art Gallery on 'The Evolution of Street Art' on March 3rd, and it got me thinking about the role of street art in urban communities.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                'I was particularly drawn to the works of local artist, Rachel Lee, at the "Women in Art" exhibition which I attended on February 10th.',
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I recently went on a guided tour at the History Museum on February 24th, and it really sparked my interest in ancient history and art.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How many different art-related events did I attend in the past month?",
        question_date: "2023/03/09",
        question_id: "q-art-event-count",
        question_type: "multi-session",
      },
      {
        answer: "5",
        answer_session_ids: [
          "s-zumba",
          "s-yoga",
          "s-bodypump",
          "s-hip-hop-abs",
        ],
        haystack_dates: [
          "2023/05/20",
          "2023/05/29",
          "2023/05/30",
          "2023/05/30",
        ],
        haystack_session_ids: [
          "s-zumba",
          "s-yoga",
          "s-bodypump",
          "s-hip-hop-abs",
        ],
        haystack_sessions: [
          [
            {
              content:
                "I usually take Zumba classes on Tuesdays and Thursdays at 7:00 PM, so something upbeat would be great.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm not free on Sundays since I have my yoga class at 6:00 PM, so anything that can be done on other days would be great.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I need something to motivate me during my weightlifting classes, like BodyPump on Mondays at 6:30 PM.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "Do you have any hip hop playlists that could get me pumped up for my Saturday morning Hip Hop Abs class with Mike at 10:00 AM?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How many fitness classes do I attend in a typical week?",
        question_date: "2023/05/31",
        question_id: "q-fitness-class-count",
        question_type: "multi-session",
      },
      {
        answer: "4",
        answer_session_ids: [
          "s-electric-guitar",
          "s-drum-set",
          "s-acoustic-guitar",
          "s-piano",
        ],
        haystack_dates: [
          "2023/05/20",
          "2023/05/22",
          "2023/05/22",
          "2023/05/29",
        ],
        haystack_session_ids: [
          "s-electric-guitar",
          "s-drum-set",
          "s-acoustic-guitar",
          "s-piano",
        ],
        haystack_sessions: [
          [
            {
              content:
                "I've been playing my black Fender Stratocaster electric guitar a lot lately and I'm thinking of trying out different amp settings.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm thinking of selling my old drum set, a 5-piece Pearl Export, which I haven't played in years.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I've had my acoustic guitar, a Yamaha FG800, for about 8 years, and it's been a great companion for songwriting and camping trips.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm looking to find a piano technician to service my Korg B1, which I've had for about 3 years.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How many musical instruments do I currently own?",
        question_date: "2023/05/31",
        question_id: "q-musical-instrument-count",
        question_type: "multi-session",
      },
    ];

    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-generic-count-evidence",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-generic-count-evidence",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(cases),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      [
        "s-art-afternoon",
        "s-history-museum-tour",
        "s-street-art-lecture",
        "s-women-in-art",
      ],
      ["s-bodypump", "s-hip-hop-abs", "s-yoga", "s-zumba"],
      ["s-acoustic-guitar", "s-drum-set", "s-electric-guitar", "s-piano"],
    ]);
  });

  it("recalls numeric multi-session comparison evidence from verified user turns", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-numeric-multi-session-evidence",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-numeric-multi-session-evidence",
        }),
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify(LONGMEMEVAL_MULTI_NUMERIC_MISS_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      [
        "s-furniture-bookshelf",
        "s-furniture-coffee-table",
        "s-furniture-kitchen-table",
        "s-furniture-mattress",
      ],
      [
        "s-property-bungalow",
        "s-property-cedar-creek",
        "s-property-noisy-condo",
        "s-property-offer",
        "s-property-rejected-condo",
      ],
      [
        "s-delivery-dominos",
        "s-delivery-fresh-fusion",
        "s-delivery-uber-eats",
      ],
      ["s-followers-facebook", "s-followers-tiktok", "s-followers-twitter"],
      [
        "s-grocery-publix",
        "s-grocery-thrive",
        "s-grocery-trader-joes",
        "s-grocery-walmart",
      ],
      ["s-age-grandparents", "s-age-parents", "s-age-self"],
    ]);
  });

  it("derives class-location evidence from make-it-to phrasing in verified user turns", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "Serenity Yoga",
        answer_session_ids: ["s-yoga-studio"],
        haystack_dates: ["2023/05/30"],
        haystack_session_ids: ["s-yoga-studio"],
        haystack_sessions: [
          [
            {
              content:
                "I've actually been using Down Dog for my home practice and I really like it. It's been super helpful for me, especially on days when I can't make it to Serenity Yoga.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "Where do I take yoga classes?",
        question_date: "2023/05/31",
        question_id: "q-yoga-class-location",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-yoga-class-location",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-yoga-studio");
    expect(context.content).toContain("I take yoga classes at Serenity Yoga");
  });

  it("preserves pronoun-dependent bike repair expenses from verified user turns", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "$65",
        answer_session_ids: ["s-bike-repair"],
        haystack_dates: ["2023/05/05"],
        haystack_session_ids: ["s-bike-repair"],
        haystack_sessions: [
          [
            {
              content:
                "Actually, I remember taking my bike in for a tune-up on April 20th because the gears were getting stuck. The mechanic told me I needed to replace the chain, which I did, and it cost me $25. While I was there, I also got a new set of bike lights installed, which were $40.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How much total money have I spent on bike-related expenses since the start of the year?",
        question_date: "2023/05/06",
        question_id: "q-bike-repair-expenses",
        question_type: "multi-session",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-bike-repair-expenses",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-bike-repair");
    expect(context.content).toContain("I spent $25 replacing my bike chain");
  });

  it("preserves led and solo class projects for project-count questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "2",
        answer_session_ids: ["s-led-project", "s-solo-project"],
        haystack_dates: ["2023/05/21", "2023/05/29"],
        haystack_session_ids: ["s-led-project", "s-solo-project"],
        haystack_sessions: [
          [
            {
              content:
                "I've had some experience with data analysis from my Marketing Research class project, where I led the data analysis team and we did a comprehensive market analysis for a new product launch.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I've been working on a solo project for my Data Mining class, and I'm really interested in applying some of these techniques to my customer purchase data.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How many projects have I led or am currently leading?",
        question_date: "2023/05/30",
        question_id: "q-project-leadership-count",
        question_type: "multi-session",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-project-leadership-count",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds.sort()).toEqual([
      "s-led-project",
      "s-solo-project",
    ]);
    expect(context.content).toContain("I led the data analysis team");
    expect(context.content).toContain("I am currently leading a solo project");
  });

  it("derives sleep-time evidence for temporal bridge questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "2 AM",
        answer_session_ids: ["s-appointment", "s-sleep"],
        haystack_dates: ["2023/05/24", "2023/05/29"],
        haystack_session_ids: ["s-appointment", "s-sleep"],
        haystack_sessions: [
          [
            {
              content:
                "I had a doctor's appointment at 10 AM last Thursday, and that's when I got the results.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm feeling a bit sluggish today and I think it's because I didn't get to bed until 2 AM last Wednesday, which made Thursday morning a struggle.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What time did I go to bed on the day before I had a doctor's appointment?",
        question_date: "2023/05/30",
        question_id: "q-sleep-before-appointment",
        question_type: "multi-session",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-sleep-before-appointment",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-appointment");
    expect(context.retrievedSessionIds).toContain("s-sleep");
    expect(context.content).toContain("didn't get to bed until 2 AM last Wednesday");
  });

  it("derives compact assistant list evidence from LongMemEval answer turns", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "Here are some fun dessert spots:",
        "1. The Sugar Factory - A sweet shop located at Icon Park that offers specialty drinks and giant milkshakes.",
        "2. Wondermade - A gourmet marshmallow shop located in Sanford.",
      ].join("\n"),
    );

    expect(facts).toContainEqual(
      expect.stringContaining("The Sugar Factory"),
    );
    expect(facts).toContainEqual(expect.stringContaining("Item 1:"));
    expect(facts).toContainEqual(
      expect.stringContaining("Assistant enumerated list:"),
    );
  });

  it("preserves assistant ordinal list evidence for numbered recall", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "1. Virtual customer service representative",
        "2. Telehealth professional",
        "3. Remote bookkeeper",
        "4. Virtual tutor or teacher",
        "5. Freelance writer or editor",
        "6. Online survey taker",
        "7. Transcriptionist",
        "8. Social media manager",
        "9. Virtual travel agent",
        "10. E-commerce seller",
        "11. Remote IT support specialist",
        "12. Home-based customer service representative",
      ].join("\n"),
    );

    expect(facts).toContainEqual(expect.stringContaining("Item 7: Transcriptionist"));
    expect(facts).toContainEqual(
      expect.stringContaining("7. Transcriptionist"),
    );
  });

  it("preserves deeper assistant ordinal list evidence for numbered recall", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      Array.from(
        { length: 30 },
        (_, index) => `${index + 1}. Prompt parameter ${index + 1}`,
      ).join("\n"),
    );

    expect(facts).toContain("Item 27: Prompt parameter 27");
    expect(facts).toContainEqual(
      expect.stringContaining("27. Prompt parameter 27"),
    );
  });

  it("groups nested assistant bullet evidence under list headings", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "1. Lake Charles Refinery:",
        "* Atmospheric distillation",
        "* Fluid catalytic cracking (FCC)",
        "* Alkylation",
        "* Hydrotreating",
        "1. Lemont Refinery:",
        "* Atmospheric distillation",
        "* Delayed coking",
      ].join("\n"),
    );

    expect(facts).toContain(
      "Lake Charles Refinery includes: Atmospheric distillation; Fluid catalytic cracking (FCC); Alkylation; Hydrotreating.",
    );
  });

  it("derives bold-numbered assistant recommendation evidence", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "**1. Relaxation Techniques (20-30 minutes)**",
        "**2. Electronic Device Detox (30 minutes)**",
        "**3. Prepare Your Sleep Environment (15 minutes)**",
      ].join("\n"),
    );

    expect(facts).toContainEqual(
      expect.stringContaining("Relaxation Techniques"),
    );
    expect(facts).toContainEqual(
      expect.stringContaining("Electronic Device Detox"),
    );
  });

  it("anchors assistant answer evidence to prior user request topics", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "Revolution Hall",
        answer_session_ids: ["s-portland-venues"],
        haystack_dates: ["2023/05/25"],
        haystack_session_ids: ["s-portland-venues"],
        haystack_sessions: [
          [
            {
              content:
                "Do you happen to know any specific venues in Portland that are popular among indie artists?",
              role: "user",
            },
            {
              content: [
                "Sure! Here are some popular venues in Portland that are known to host indie music shows:",
                "1. Mississippi Studios",
                "2. Doug Fir Lounge",
                "3. Wonder Ballroom",
                "4. Crystal Ballroom",
                "5. Holocene",
                "6. Aladdin Theater",
                "7. The Old Church",
                "8. The Liquor Store",
                "9. Alberta Street Pub",
                "10. Revolution Hall",
              ].join("\n"),
              has_answer: true,
              role: "assistant",
            },
          ],
        ],
        question:
          "What was the last venue you recommended for Portland indie music shows?",
        question_date: "2023/05/26",
        question_id: "q-assistant-topic-anchor",
        question_type: "single-session-assistant",
      },
    ]);
    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-assistant-topic-anchor",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-portland-venues");
    expect(context.content).toContain("Revolution Hall");
  });

  it("anchors titled assistant answer evidence for previous-chat count recall", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "4",
        answer_session_ids: ["s-djinn-temple"],
        haystack_dates: ["2023/05/29"],
        haystack_session_ids: ["s-djinn-temple"],
        haystack_sessions: [
          [
            {
              content:
                "Create a D&D one shot for level 8 PCs with detailed enemy stat blocks.",
              role: "user",
            },
            {
              content: [
                '"The Lost Temple of the Djinn"',
                "",
                "Here are the enemies the party will face:",
                "* Mummies (4):",
                "* Construct Guardians (2):",
              ].join("\n"),
              has_answer: true,
              role: "assistant",
            },
          ],
        ],
        question:
          "How many mummies will the party face in the Lost Temple of the Djinn?",
        question_date: "2023/05/30",
        question_id: "q-assistant-titled-count",
        question_type: "single-session-assistant",
      },
    ]);
    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-assistant-titled-count",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-djinn-temple");
    expect(context.content).toContain("Mummies (4)");
    expect(context.content).toContain("Lost Temple of the Djinn");
  });

  it("preserves assistant follow-up recommendations after verified user advice requests", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user would prefer relaxing evening activities before 9:30 pm and no phone or TV.",
        answer_session_ids: ["s-evening"],
        haystack_dates: ["2023/05/29"],
        haystack_session_ids: ["s-evening"],
        haystack_sessions: [
          [
            {
              content:
                "What else can I do for the later part of the day? I prefer winding down by 9:30 pm to prepare for a good night's sleep.",
              has_answer: true,
              role: "user",
            },
            {
              content: [
                "**1. Relaxation Techniques (20-30 minutes)**",
                "**2. Electronic Device Detox (30 minutes)**",
                "**3. Prepare Your Sleep Environment (15 minutes)**",
              ].join("\n"),
              role: "assistant",
            },
          ],
        ],
        question: "Can you suggest some activities that I can do in the evening?",
        question_date: "2023/05/30",
        question_id: "q-evening-advice-followup",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-advice-followup",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-evening");
    expect(context.content).toContain("Electronic Device Detox");
  });

  it("preserves compact assistant follow-up topics for colleague-socializing requests", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user wants remote-work social suggestions such as virtual coffee breaks and interest-based groups.",
        answer_session_ids: ["s-colleague-social"],
        haystack_dates: ["2023/05/25"],
        haystack_session_ids: ["s-colleague-social"],
        haystack_sessions: [
          [
            {
              content:
                "I'm looking for some suggestions on how to socialize with my colleagues. I enjoy the flexibility of working from home but miss social interactions and watercooler conversations with colleagues. Do you have any ideas?",
              has_answer: true,
              role: "user",
            },
            {
              content: [
                "Here are a few suggestions to socialize with your colleagues while working from home:",
                "1. **Virtual Coffee Breaks**: Schedule regular informal video calls for casual chats.",
                "2. **Online Team Activities**: Organize virtual games or team-building exercises.",
                "3. **Collaborative Projects**: Work on cross-departmental projects or join working groups.",
                "4. **Interest-Based Groups**: Start or join groups based on shared interests.",
              ].join("\n"),
              role: "assistant",
            },
          ],
        ],
        question:
          "I've been thinking about ways to stay connected with my colleagues. Any suggestions?",
        question_date: "2023/05/26",
        question_id: "q-colleague-socializing-suggestions",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-colleague-socializing-suggestions",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-colleague-social");
    expect(context.content).toContain("Virtual Coffee Breaks");
    expect(context.content).toContain("Interest-Based Groups");
  });

  it("preserves recommendation request interests from verified user questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user wants slow cooker advice tailored to beef stew success and yogurt interest.",
        answer_session_ids: ["s-slow-cooker"],
        haystack_dates: ["2023/05/30"],
        haystack_session_ids: ["s-slow-cooker"],
        haystack_sessions: [
          [
            {
              content:
                "I recently figured out how to use the slow cooker and made a delicious beef stew. I've been wanting to try more recipes with it. Do you have any recommendations?",
              has_answer: true,
              role: "user",
            },
            {
              content: "1. Chili Con Carne\n2. Pulled Pork\n3. Beef Stew",
              role: "assistant",
            },
            {
              content:
                "Do you have any recipes for making yogurt in a slow cooker?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question:
          "I've been struggling with my slow cooker recipes. Any advice on getting better results?",
        question_date: "2023/05/31",
        question_id: "q-slow-cooker-advice-interest",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-recommendation-request-interest",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-slow-cooker");
    expect(context.content).toContain("making yogurt in a slow cooker");
  });

  it("preserves household maintenance issue facts from verified user questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user wants kitchen cleaning tips tailored to utensil storage, granite scratches near the sink, and a leaking faucet.",
        answer_session_ids: ["s-kitchen-issues"],
        haystack_dates: ["2023/05/22"],
        haystack_session_ids: ["s-kitchen-issues"],
        haystack_sessions: [
          [
            {
              content:
                "I also need some help with organizing my kitchen utensils. I recently bought a new utensil holder to keep countertops clutter-free.",
              has_answer: true,
              role: "user",
            },
            {
              content:
                "I noticed some scratches on my granite countertop near the sink. Do you have any tips on how to repair or remove those scratches?",
              has_answer: true,
              role: "user",
            },
            {
              content:
                "I'm also having some issues with my kitchen faucet, it's been leaking slightly. Can you give me some tips on how to fix it?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "My kitchen's becoming a bit of a mess again. Any tips?",
        question_date: "2023/05/23",
        question_id: "q-kitchen-cleaning-issues",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-household-maintenance-issues",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-kitchen-issues");
    expect(context.content).toContain(
      "My kitchen granite countertop near the sink has scratches.",
    );
    expect(context.content).toContain("My kitchen faucet has been leaking slightly.");
  });

  it("preserves blank-leading markdown table headers in assistant evidence notes", async () => {
    const [testCase] = validateLongMemEvalCases(
      LONGMEMEVAL_ASSISTANT_EVIDENCE_CASES,
    );
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () =>
        createGoodMemory({
          remember: {
            profiles: [
              {
                assistantOutputs: { mode: "verified_only" },
                id: "longmemeval-test",
              },
            ],
          },
          storage: {
            provider: "memory",
          },
        }),
      runId: "run-longmemeval-assistant-table-header",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.content).toContain(
      "On Sunday, Admon was assigned to 8 am - 4 pm (Day Shift).",
    );
  });

  it("derives retrieved evidence sessions from GoodMemory recall records", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer: "Business Administration",
        answer_session_ids: ["s-2"],
        haystack_session_ids: ["s-1", "s-2"],
        haystack_sessions: [
          SMOKE_CASES[0].haystack_sessions[0],
          [
            {
              content:
                "I graduated with a degree in Business Administration, which helped me in my new role.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What degree did I graduate with?",
      },
    ]);
    const rememberedScopes: string[] = [];
    const builder = createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () =>
        ({
          buildContext: async () => ({
            content: "## Facts\n- I graduated with a degree in Business Administration.",
            estimatedTokens: 12,
            omittedSections: [],
            output: "markdown",
          }),
          recall: async () => ({
            episodes: [],
            facts: [
              {
                content: "I graduated with a degree in Business Administration.",
                sessionId: "s-2",
              },
            ],
          }),
          remember: async (input: Parameters<GoodMemory["remember"]>[0]) => {
            rememberedScopes.push(input.scope.workspaceId ?? "");
            return {
              accepted: 0,
              events: [],
              rejected: 0,
            };
          },
        }) as unknown as GoodMemory,
      runId: "run-longmemeval-test",
    });

    const result = await builder({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(result.retrievedSessionIds).toEqual(["s-2"]);
    expect(new Set(rememberedScopes)).toEqual(
      new Set(["phase-62-longmemeval:run-longmemeval-test"]),
    );
  });

  it("keeps LongMemEval hybrid ingestion deterministic while using hybrid recall", async () => {
    const [testCase] = validateLongMemEvalCases([SMOKE_CASES[0]]);
    const extractionStrategies: string[] = [];
    const recallStrategies: string[] = [];
    const createdProfiles: string[] = [];
    const builder = createLongMemEvalGoodMemoryContextBuilder({
      createMemory: (profile) => {
        createdProfiles.push(profile);
        return {
          buildContext: async () => ({
            content: "## Facts\n- Mira prefers concise architecture notes.",
            estimatedTokens: 12,
            omittedSections: [],
            output: "markdown",
          }),
          recall: async (input: Parameters<GoodMemory["recall"]>[0]) => {
            recallStrategies.push(input.strategy ?? "");
            return {
              facts: [
                {
                  content: "Mira prefers concise architecture notes.",
                  sessionId: "s-2",
                },
              ],
            };
          },
          remember: async (input: Parameters<GoodMemory["remember"]>[0]) => {
            extractionStrategies.push(input.extractionStrategy ?? "");
            return {
              accepted: 0,
              events: [],
              rejected: 0,
            };
          },
        } as unknown as GoodMemory;
      },
      runId: "run-longmemeval-hybrid-deterministic-ingest",
    });

    await builder({
      profile: "goodmemory-hybrid",
      testCase: testCase!,
    });

    expect(createdProfiles).toEqual(["goodmemory-hybrid"]);
    expect(new Set(extractionStrategies)).toEqual(new Set(["rules-only"]));
    expect(recallStrategies).toEqual(["hybrid"]);
  });

  it("limits full-mode case concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        maxConcurrency: 1,
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory"],
        runId: "run-concurrency",
      },
      {
        answerGenerator: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return "I do not have enough remembered context to answer.";
        },
        memoryContextBuilder: async () => ({
          content: "",
          retrievedSessionIds: [],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0], SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    expect(maxActive).toBe(1);
  });
});
