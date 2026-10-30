import type { SiteContent } from "@/content/types";
import { ENV } from "@/env.server";

const content: SiteContent = {
  cases: {
    "capsule-collections": {
      description:
        "Launch a small print-on-demand capsule around one theme: researched ideas, print-checked graphics, Fourthwall listings priced to margin and a paused Meta campaign.",
      exampleBrief:
        "A four-piece spring capsule of washed botanical line drawings, muted greens and bone, for people who garden on balconies.",
      faq: [
        {
          answer:
            "Three to six pieces is a good size: enough to feel like a collection, few enough to edit carefully and talk about one by one.",
          question: "How many pieces should a capsule have?",
        },
        {
          answer:
            "Yes. Run one drop per piece or idea under the same brief, approve the designs that belong together and reject the ones that don't.",
          question: "Can the pieces share one look?",
        },
        {
          answer:
            "Each product is priced on its own blank's base cost, so a tee and a sweatshirt in the same capsule each keep at least $10 profit and a 30% margin.",
          question: "How are different blanks in one capsule priced?",
        },
      ],
      lead: "A capsule is a small, edited set of pieces around one idea. wovain researches the theme, drafts the graphics in your direction, lists the pieces you approve on Fourthwall and stages the campaign, paused.",
      name: "Capsule collections",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "You think in collections, not one-off products. A capsule has to hang together: one palette, one mood, a few silhouettes. On print-on-demand, the design part is the fun; the listings, pricing and ads for every piece are what make a small capsule feel like a big job.",
      steps: [
        {
          body: "Describe the theme, the palette and who the capsule is for, as you would brief a studio.",
          title: "Brief the capsule",
        },
        {
          body: "wovain suggests directions inside your theme, each with its sources and a note on how crowded similar listings are.",
          title: "Choose the directions",
        },
        {
          body: "Approve the graphics that belong together. Send the others back with a note, such as “same line weight as the first one”.",
          title: "Edit for coherence",
        },
        {
          body: "The approved pieces become hidden Fourthwall products on real blanks, each priced from its own base cost. Publish them together.",
          title: "List the set",
        },
        {
          body: "A paused Meta campaign is ready for each piece, with ads written from different angles. Turn them on for the launch.",
          title: "Stage the launch",
        },
      ],
      tips: [
        "Decide the palette before the motifs. Two or three ink colours across the capsule make it read as one collection.",
        "Mix blanks on purpose: a tee, a heavier sweatshirt and a tote give buyers three price points from one idea.",
        "Publish every piece on the same day, so the capsule lands as a set rather than a trickle.",
        "Name the pieces like a collection (“Fern Study No. 1, 2, 3”) so each listing points to the others.",
        "Start the campaign on a small daily budget and see which piece people answer before you spend more.",
      ],
      title: "Launch a print-on-demand capsule collection, edited by you",
    },
    "graphic-tees": {
      description:
        "Turn a graphic idea into tees that sell: designs checked for print at chest size, real Fourthwall blanks priced to clear $10 profit and a paused Meta campaign.",
      exampleBrief:
        "Heavyweight tees with a single-colour linocut-style motif, coastal and a little dry, for people who swim in cold water.",
      faq: [
        {
          answer:
            "From the blank's base cost on Fourthwall. A $12 blank sells at $24, which leaves $10.33 after card fees, sales tax and a refund reserve.",
          question: "What does a typical tee sell for?",
        },
        {
          answer:
            "Every draft is checked for print size, legibility at chest size and the number of colours before you see it.",
          question: "Will the graphic print well?",
        },
        {
          answer:
            "Not yet. wovain drafts the graphics from your brief, and you shape them with notes until they are right.",
          question: "Can I upload my own artwork?",
        },
      ],
      lead: "A good graphic tee is one strong idea, printed well and priced right. wovain drafts the graphic in your direction, checks it for print and lists the tee on your Fourthwall shop at a margin that holds.",
      name: "Graphic tees",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "You have a graphic language: a line, a type style, a way of drawing. Tees are the most direct way to put it in front of people, and print-on-demand means no stock. What you don't want is a week of mockups, size charts, pricing sums and ad settings for every new tee.",
      steps: [
        {
          body: "Describe the motif, the style and who wears it. Say what to avoid, such as “no slogans”.",
          title: "Brief the graphic",
        },
        {
          body: "wovain drafts graphics for each idea and checks them for print size, chest-size legibility and colours.",
          title: "See checked drafts",
        },
        {
          body: "Approve the ones you would sign. Reject with a note, such as “heavier type”, for another round.",
          title: "Edit and approve",
        },
        {
          body: "The tee is created hidden on a real Fourthwall blank, priced from its base cost. Publish when the page looks right.",
          title: "List the tee",
        },
        {
          body: "Ads from several angles wait in a paused Meta campaign until you turn it on.",
          title: "Stage the ads",
        },
      ],
      tips: [
        "Design for chest size. A graphic that reads at 10 inches across will read on the street; fine detail often won't.",
        "Fewer ink colours print cleaner and keep the look consistent across garment colours.",
        "Heavyweight blanks cost more but carry a label's look better. The 30% margin floor keeps the price honest.",
        "Check the live product page on your phone before you tell anyone.",
        "Let the ad angle match the graphic: a dry, minimal tee wants dry, minimal copy.",
      ],
      title: "Graphic tees on print-on-demand, drafted in your direction",
    },
    "independent-labels": {
      description:
        "Print-on-demand for independent labels: research, graphics drafted in your direction, Fourthwall listings priced to margin and paused Meta ads. You approve each step.",
      exampleBrief:
        "A quiet autumn drop for my label: faded workwear graphics, rust and navy, for people who repair their own clothes.",
      faq: [
        {
          answer:
            "You do. You write the direction, approve every piece and can reject any draft with a note. Nothing is listed without your yes.",
          question: "Who decides what my label releases?",
        },
        {
          answer:
            "No. wovain works with print-on-demand blanks on Fourthwall. It does not manage cut-and-sew production.",
          question: "Does wovain handle cut-and-sew?",
        },
        {
          answer:
            "In your own Fourthwall shop, under your label's name. Fourthwall prints, ships and runs checkout.",
          question: "Where are the products sold?",
        },
        {
          answer:
            "No. Every campaign is created paused, with the daily budget you choose. Spend starts only when you approve it, and wovain starts it only once its spend rules are in place.",
          question: "Will ads run without me?",
        },
      ],
      lead: "You run a small label and every release is a week of admin. wovain takes on the research, listings, pricing and ad set-up around a print-on-demand drop, and leaves the taste decisions with you.",
      name: "Independent labels",
      related: ["fourthwall", "fal", "meta", "chatgpt"],
      situation:
        "Your label is one to five people. The same person art-directs, merchandises, answers emails and runs the ads. Print-on-demand lets you release without stock, but each drop still means research, files, listings, pricing sums and a campaign. You want a steady release rhythm without losing the label's look.",
      steps: [
        {
          body: "Write the direction the way you'd brief a studio: mood, references, who it's for.",
          title: "Set the direction",
        },
        {
          body: "wovain looks at what your audience is into this week and suggests ideas, each with its sources.",
          title: "Review the ideas",
        },
        {
          body: "Graphics are drafted for each idea and checked for print. Approve or send back with a note.",
          title: "Edit the drafts",
        },
        {
          body: "Approved designs become hidden products in your Fourthwall shop, priced to at least $10 profit and a 30% margin.",
          title: "List on Fourthwall",
        },
        {
          body: "Several ads, written from different angles, wait in a paused Meta campaign until you turn it on.",
          title: "Stage the campaign",
        },
      ],
      tips: [
        "Keep one brief per drop. A focused direction gets a coherent first round.",
        "Say what the label never does (“no slogans”, “no neon”) so the drafts start inside your rules.",
        "Release on a rhythm, such as one small drop a month. A steady cadence is easier to promote than a big launch.",
        "Read the sources behind an idea before you pick it. A theme tied to one week's news may age fast.",
        "Turn on autopilot only once you trust the first few drops you ran yourself.",
      ],
      title: "Print-on-demand for independent labels, without the admin",
    },
    "streetwear-drops": {
      description:
        "Run limited streetwear drops on print-on-demand: ideas timed to this week, graphics in your direction, Fourthwall listings at a fair margin and paused Meta ads.",
      exampleBrief:
        "A one-week drop of oversized tees and hoodies, grainy photocopy graphics, for people who skate at night.",
      faq: [
        {
          answer:
            "Print-on-demand pieces are made after each order, so a drop has no stock to sell out. You make it limited by time: publish it, then hide it in Fourthwall when the window closes.",
          question: "Can a print-on-demand drop be limited?",
        },
        {
          answer:
            "Hoodies use the same rule as tees: at least $10 profit and a 30% margin over the blank's base cost. A $35 blank sells at $50 and leaves $12.",
          question: "How are hoodies priced?",
        },
        {
          answer:
            "wovain screens drafts for names and marks you shouldn't use, but you stay responsible for what you publish. Keep other brands off the print.",
          question: "Can I reference other brands?",
        },
      ],
      lead: "Streetwear runs on timing. wovain checks what is moving this week inside your theme, drafts graphics in your direction, and stages the listings and ads so the drop is ready when you are.",
      name: "Streetwear drops",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Your label releases in short windows. Each drop needs a reason to exist now, a few strong graphics and everything live at once. On print-on-demand you skip the stock risk, but the prep around each release is still the bottleneck.",
      steps: [
        {
          body: "Name the theme, the graphic style and the crowd. Add the window, such as “one week”.",
          title: "Brief the drop",
        },
        {
          body: "Ideas come with this week's context and a note on how crowded similar listings already are.",
          title: "Pick a timely angle",
        },
        {
          body: "Approve the graphics that hit. Reject the rest with a note for another round.",
          title: "Edit the graphics",
        },
        {
          body: "Products are created hidden on real blanks and priced to margin. Publish them all at the drop time.",
          title: "List for the drop",
        },
        {
          body: "The campaign waits, paused, with ads from several angles. Turn it on when the drop opens.",
          title: "Open the drop",
        },
      ],
      tips: [
        "Announce the window before the drop and keep to it. Hide the products in Fourthwall when it closes.",
        "Oversized and heavyweight blanks suit the look and carry a higher price. The margin floor sets it for you.",
        "Use one graphic language across tees and hoodies so the drop reads as one release.",
        "Keep other brands, logos and characters off the print.",
        "Run the ads only while the drop is open, then turn them off.",
      ],
      title: "Streetwear drops on print-on-demand, timed and staged",
    },
  },
  guides: {
    "launch-a-capsule-drop": {
      description:
        "A practical guide to launching a print-on-demand capsule drop: research, design and print checks, editing, listing on Fourthwall, ad variants and a paused campaign.",
      faq: [
        {
          answer:
            "Three to six pieces. Enough to feel like a collection, few enough to edit carefully and promote one by one.",
          question: "How many pieces should a first capsule have?",
        },
        {
          answer:
            "Start small, a few dollars a day, and raise the budget only on the ad that gets results. Your profit per sale sets the limit.",
          question: "How much should I spend on Meta ads for a drop?",
        },
        {
          answer:
            "Yes: research, drafted graphics with print checks, Fourthwall listings and a paused Meta campaign. You approve each step, and you turn the campaign on.",
          question: "Does wovain do all of this?",
        },
        {
          answer:
            "Yes. Publish the products and share them yourself. The paused campaign can wait until you want more reach.",
          question: "Can I launch without ads?",
        },
      ],
      lead: "A capsule drop has six parts: research, design, checks, editing, listing and ads. Here is how to run each one, what to check before money starts moving, and a checklist to keep.",
      published: "2026-10-26",
      readingMinutes: 5,
      sections: [
        {
          heading: "Research: taste, timing and how crowded it is",
          paragraphs: [
            "Good drop ideas sit where three things meet. Your audience likes the theme. Something about it is in the air this week. And not too many shops already sell it.",
            "Taste comes first. Ask what the people who buy from you also love: the films, music, places and styles they share. A label for people who garden might find a richer seam in slow mornings and old seed catalogues than in another leaf on a tee.",
            "Then timing. Look at the past week's news inside that theme. A season, an anniversary or an event gives the drop a reason to exist now, and something to say in the ad.",
            "Last, check the listings. Search the big print-on-demand marketplaces for the idea. If there are hundreds of near-copies, your version has to be much better, or you should pick another angle.",
            "Write down why each idea made the list. You will reuse those reasons in the ad copy, and they help you drop ideas that only looked good for a day.",
          ],
        },
        {
          heading: "Design, then check before anyone sees it",
          list: [
            "Print size: the file must be big enough for the print area. wovain fails anything narrower than 2880 px.",
            "Colours: the ink must read on the garment colour. Dark art on a dark tee disappears.",
            "Legibility: type and line work must hold up at chest size.",
            "Originality: no other brands, artists, film titles or characters unless you have the rights.",
          ],
          paragraphs: [
            "Turn each idea into a short brief: what is printed, the style, the garment colours and anything to avoid. Then make a few candidates rather than one.",
            "Check each design against the plain rules before you fall in love with it. A design that fails one of these is cheaper to fix now than after a customer opens the parcel.",
            "In wovain, every draft arrives with a print check marked ready or needs work, with what to fix. The print-size rule is fixed, so a file that is too small never passes.",
          ],
        },
        {
          heading: "Edit like a collection",
          paragraphs: [
            "Editing is where your eye matters most. Approve the pieces you would put your name on. Reject the rest with one line on why, such as “type too thin” or “lose the leaves”, so the next round is better.",
            "Edit for the set, not just the single piece. Same palette, same line weight, one mood. A tight capsule of four reads stronger than a loose dozen.",
          ],
        },
        {
          heading: "List on Fourthwall at a price that pays",
          paragraphs: [
            "Create each product on the blank you chose and set a price that clears your floor after fees. A simple rule is at least $10 profit per sale and a 30% margin, whichever is higher: a $12 tee sells at $24, a $25 blank at $38.",
            "Keep the products hidden until the pages look right: photos, title, sizes and price. Then publish the set together, and open each live page once as a buyer would.",
            "Publish before you announce. A post that goes out while the products are still hidden sends people to a dead link, and that first wave of attention is hard to win back.",
          ],
        },
        {
          heading: "Write ads from different angles",
          paragraphs: [
            "One ad tells you very little. Two or three, each from a different angle, tell you what your audience responds to.",
            "Pick angles that are actually different: the craft (how the piece is made and printed), the identity (“for people who repair their own clothes”) and the moment (this week's reason to buy). Keep the same product so the angle is the only change.",
            "Keep the copy short and true. Say what the piece is, who it is for and why now. Skip claims you can't back, such as “best-selling” on a product that launched today.",
          ],
        },
        {
          heading: "Why the campaign starts paused, and how to pick a budget",
          paragraphs: [
            "A campaign that goes live the moment it is built can spend before anyone has read the ads. Building it paused gives you a calm moment to check everything, and nothing is spent until you decide.",
            "For the daily budget, start small. A few dollars a day is enough to see which ad gets clicks without risking much. Ad spend comes out of your profit per sale, so a $10 margin leaves little room for expensive clicks. wovain accepts a daily budget from $1 to $500, and you can change it in Meta at any time.",
            "Give each test a few days before you judge it. One quiet afternoon says little; a pattern over several days says more.",
          ],
        },
        {
          heading: "Your pre-launch checklist",
          list: [
            "Every piece is published and its page loads on your phone.",
            "Price, sizes and colours on each page are what you approved.",
            "Each ad links to the right product.",
            "The headlines promise nothing the pieces don't do.",
            "The countries match where you want to sell.",
            "The daily budget is one you are happy to spend every day.",
            "You have a post or newsletter planned for the launch.",
            "You know when you will look at the results, such as after three days.",
          ],
          paragraphs: [
            "Go through this before you turn the campaign on. It takes ten minutes and catches most mistakes.",
          ],
        },
      ],
      title:
        "How to launch a print-on-demand capsule drop, from idea to a paused campaign",
    },
    "price-print-on-demand": {
      description:
        "A plain guide to pricing print-on-demand pieces: base cost, card fees, tax and refunds, a $10 profit floor and a 30% margin floor, with worked examples.",
      faq: [
        {
          answer:
            "Enough to be worth the work after every fee. A $10 floor per sale, plus at least a 30% margin on pricier blanks, is a sensible starting rule.",
          question: "What is a good profit per print-on-demand sale?",
        },
        {
          answer:
            "You can pass shipping to the buyer, but card fees are charged on it too. Count that fee when you check your profit.",
          question: "Should I include shipping in my price?",
        },
        {
          answer:
            "Doubling works for cheap blanks but overprices expensive ones, and it ignores fees. A profit floor plus a margin floor handles both ends.",
          question: "Why not just double the base cost?",
        },
        {
          answer:
            "Yes. Products are created hidden in your Fourthwall shop, and you can edit the price there before or after publishing.",
          question: "Can I change the price wovain sets?",
        },
      ],
      lead: "Most print-on-demand pricing goes wrong the same way: base cost plus a round number, and the fees eat the rest. Here is a simple rule that keeps at least $10 per sale, with the sums shown.",
      published: "2026-10-26",
      readingMinutes: 5,
      sections: [
        {
          heading: "Start from the base cost",
          paragraphs: [
            "Every print-on-demand product starts with a base cost: what the platform charges to print and make one item on a given blank. A basic tee might be $12, a heavyweight tee $15, a hoodie $25 to $35. It changes with the blank, the print area and sometimes the colour.",
            "The base cost is the one number you can't negotiate per sale, so it is where pricing should begin. Look it up for the exact blank and print you plan to sell, not for the cheapest version of that product.",
            "The mistake is to stop there and add a round number. “Base cost plus $10” sounds like $10 profit, but it isn't. Several small costs come out of every sale before the money reaches you.",
          ],
        },
        {
          heading: "Count what comes out of every sale",
          list: [
            "Card fee: 2.9% of price + shipping + tax, plus $0.30",
            "Shipping: passed through to the buyer ($5 in the examples below)",
            "Sales tax: passed through (7% in the examples below)",
            "Refund reserve: 2% of the price",
          ],
          paragraphs: [
            "Three costs are easy to forget because they are not on the product page.",
            "Card fees. Payment processors usually charge a percentage plus a fixed amount per order. A common rate is 2.9% plus $0.30. The percentage applies to the whole order the buyer pays, including shipping and sales tax, not just your price.",
            "Sales tax. You collect it and pass it on, so it is not income. But it makes the order bigger, and so it makes the card fee bigger.",
            "Refunds. Some orders come back: wrong size, lost parcel, a change of mind. Setting aside a small share of each price, such as 2%, means a refund does not wipe out the profit from several other sales.",
          ],
        },
        {
          heading: "Set two floors: $10 profit and a 30% margin",
          paragraphs: [
            "A good price clears two tests at once.",
            "The profit floor: after the base cost, card fees and refund reserve, each sale leaves at least $10. That is enough to be worth a sale and a customer email. You can choose a different number, but pick one and stick to it.",
            "The margin floor: the gap between price and base cost is at least 30% of the price, written as (price − base cost) ÷ price ≥ 30%. A flat $10 is a lot on a $12 tee but thin on a $35 hoodie. The margin floor makes sure pricier pieces keep a fair share.",
            "Take whichever floor gives the higher price, then round up to a whole dollar. Whole-dollar prices read cleaner on a product page.",
          ],
        },
        {
          heading: "Worked examples",
          list: [
            "$8 base cost → $20 price, $10.53 profit",
            "$12 base cost → $24 price, $10.33 profit",
            "$15 base cost → $27 price, $10.18 profit",
            "$20 base cost → $33 price, $10.87 profit",
            "$25 base cost → $38 price, $10.62 profit",
            "$35 base cost → $50 price, $12.00 profit",
          ],
          paragraphs: [
            "Here is the rule applied to six base costs, with $5 shipping, 7% tax, card fees of 2.9% plus $0.30 and a 2% refund reserve. Profit is what is left after the base cost, the card fee and the reserve.",
            "Take the $12 tee step by step. A first guess of $22 (base plus $10) looks fine. At $22 the order is $22 + $5 shipping + $1.54 tax = $28.54. The card fee is about $1.13 and the reserve $0.44, so profit is $8.43. Not enough. At $23 it is $9.38. At $24 the order is $30.68, the card fee $1.19, the reserve $0.48, and profit is $10.33. So the price is $24.",
            "Now the $35 blank. Base plus $10 would be $45, but at $45 the margin is only 22% and profit after fees is $7.26. The 30% margin floor sets the price at $50, which leaves $12.00. For expensive blanks, the margin floor is the one that matters.",
          ],
        },
        {
          heading: "When to price higher",
          paragraphs: [
            "The floors are a minimum, not a target. Many label pieces can and should sell above them.",
            "Price higher when the drop is limited, when the design took real work or a collaborator needs paying, or when your buyers already pay more for your label elsewhere. Price higher too if you plan to run ads: ad spend comes out of that $10, so a piece that needs paid reach needs more room.",
            "Price near the floor when the goal is reach rather than income: a first drop, or a low-cost piece people can buy on impulse. Even then, don't go below the floor. A sale that leaves $3 isn't worth the support load.",
            "Whatever you choose, check the real numbers for your shop. Tax rates, shipping and fees vary by country and platform, so use the rule with your own inputs.",
          ],
        },
        {
          heading: "How wovain applies this for you",
          paragraphs: [
            "wovain uses exactly this rule. When a design becomes a product, wovain reads the real base cost of the Fourthwall blank, then sets the lowest whole-dollar price that clears both $10 profit and a 30% margin after card fees, sales tax and a 2% refund reserve. The price, profit and margin are shown with the product, so you can see the sum, not just the answer.",
            "The rule is fixed, so autopilot can't skip it. Products are created hidden, so you can change the price in Fourthwall before you publish if you want to sit above the floor.",
          ],
        },
      ],
      title:
        "How to price print-on-demand pieces so every sale clears a profit",
    },
  },
  integrations: {
    chatgpt: {
      category: "App in ChatGPT",
      connection: "yours",
      data: "ChatGPT sends your requests to wovain. wovain uses the same account, drops and connections as the website, so you can start a drop in chat and finish it on the web.",
      description:
        "Add wovain to ChatGPT and run a print-on-demand drop in plain words: ideas, drafted graphics, Fourthwall listings and a paused Meta campaign, with your approval.",
      docsPath: "/docs/chatgpt",
      faq: [
        {
          answer:
            "Yes. The same steps, approvals and rules run in both places, and drops started in ChatGPT appear under Runs on the website.",
          question: "Is it the same as the website?",
        },
        {
          answer:
            "Yes. Ask for a drop with autopilot on. It goes through to a published product and a paused campaign, with the same price and budget limits as on the web.",
          question: "Can I use autopilot from ChatGPT?",
        },
        {
          answer:
            "Yes. ChatGPT gives you a connect link for each account you still need, and you authorize your own shop and ad account.",
          question: "Do I still connect Fourthwall and Meta?",
        },
      ],
      lead: "If you already plan in ChatGPT, you can run your drop there too. Add wovain as an app, describe the drop, and say yes at each step.",
      name: "ChatGPT",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup: `In ChatGPT, turn on developer mode, add a custom connector with ${ENV.MCP_URL}, then sign in to wovain and allow access.`,
      steps: [
        {
          body: `In ChatGPT's settings, turn on developer mode and add a custom connector with the URL ${ENV.MCP_URL}.`,
          title: "Add wovain to ChatGPT",
        },
        {
          body: "ChatGPT opens the wovain sign-in page. After you sign in, you allow ChatGPT to use your wovain account.",
          title: "Sign in and allow access",
        },
        {
          body: "If an account isn't connected yet, ChatGPT gives you a link to connect it.",
          title: "Connect your accounts",
        },
        {
          body: "Describe the drop in your own words, such as “a spring drop of washed botanical line drawings for my label”.",
          title: "Ask for a drop",
        },
        {
          body: "ChatGPT asks you before it approves a design, lists products or builds the campaign. The campaign is still created paused.",
          title: "Approve each step",
        },
      ],
      title:
        "wovain in ChatGPT: plan and launch a print-on-demand drop from a chat",
    },
    fal: {
      category: "Artwork",
      connection: "yours",
      data: "wovain sends fal the art direction for each idea and gets back the graphic. Images are generated on your fal account and stored with your drop.",
      description:
        "Connect your fal account to wovain. It draws the graphics for each idea in your direction, at print resolution, and every draft is checked for print before you see it.",
      docsPath: "/docs/connecting-accounts#fal",
      faq: [
        {
          answer:
            "fal bills image generation to your own fal account, at fal's prices. wovain's plan is separate; see the pricing page.",
          question: "Who pays for the images?",
        },
        {
          answer: "Yes. You own your briefs and the designs you approve.",
          question: "Do I own the graphics?",
        },
        {
          answer:
            "Reject the draft with a note, such as “heavier line”, and wovain draws another round for the same idea.",
          question: "What if a draft isn't right?",
        },
      ],
      lead: "fal is where the graphics are drawn. wovain turns each idea into an art direction, fal draws it on your account, and wovain checks the result for print before you edit it.",
      name: "fal",
      related: ["graphic-tees", "capsule-collections", "streetwear-drops"],
      setup: "Open Connections in wovain and connect your fal account.",
      steps: [
        {
          body: "Each idea becomes a short art direction: what is printed, the style, the colours and what to avoid.",
          title: "Write the art direction",
        },
        {
          body: "fal draws the graphic on your account as transparent, square print art.",
          title: "Draw the graphic",
        },
        {
          body: "The draft is checked for print size, legibility at chest size and colours, and marked ready or needs work.",
          title: "Check it for print",
        },
        {
          body: "You approve the draft or send it back with a note for another round.",
          title: "Edit with you",
        },
      ],
      title:
        "fal and wovain: graphics drawn in your direction, checked for print",
    },
    fourthwall: {
      category: "Print-on-demand shop",
      connection: "yours",
      data: "wovain reads catalog blanks and base costs, and sends your approved artwork, title, description and price to create products in your shop. The connection is stored encrypted, and you can disconnect it in Connections at any time.",
      description:
        "Connect your Fourthwall shop to wovain. Approved designs become products on real blanks, priced to clear $10 profit a sale, and stay hidden until you publish.",
      docsPath: "/docs/connecting-accounts#fourthwall",
      faq: [
        {
          answer:
            "Yes. wovain creates products in the shop you connect, so they are yours from the start. You keep running the shop in Fourthwall as usual.",
          question: "Do I need my own Fourthwall shop?",
        },
        {
          answer:
            "No. Products are created hidden and go live when you publish them. The one exception is autopilot, which you switch on yourself for a drop.",
          question: "Will products go live without me?",
        },
        {
          answer:
            "From the blank's base cost: at least $10 profit per sale and at least a 30% margin, whichever is higher, rounded up to a whole dollar. You can change the price in Fourthwall afterwards.",
          question: "How does wovain set the price?",
        },
        {
          answer:
            "No. Orders, payouts and customer messages stay in your Fourthwall shop. wovain only creates and publishes products.",
          question: "Does wovain handle my orders?",
        },
      ],
      lead: "Fourthwall is where your pieces are listed and sold. wovain reads its catalog for real blanks and base costs, then turns the designs you approve into products in your own shop.",
      name: "Fourthwall",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup:
        "Sign in to wovain, open Connections and authorize your own Fourthwall shop.",
      steps: [
        {
          body: "wovain looks up real Fourthwall blanks and their base costs, so every price, profit and margin you see is a real number.",
          title: "Read the catalog",
        },
        {
          body: "The price starts from the blank's base cost and clears at least $10 profit and a 30% margin after card fees, sales tax and a refund reserve. A $12 blank sells at $24.",
          title: "Price each piece",
        },
        {
          body: "Your approved artwork is uploaded and the product is created with its title, description and price. It stays hidden, so nothing appears in your shop yet.",
          title: "Create the product, hidden",
        },
        {
          body: "You check the product and publish it. Only then does it go live in your shop. On autopilot, wovain publishes for you after every check passes.",
          title: "Publish when you say so",
        },
      ],
      title:
        "Fourthwall and wovain: from approved design to a product in your shop",
    },
    meta: {
      category: "Ads",
      connection: "yours",
      data: "wovain sends the ad copy, the product link and the countries and budget you chose to your ad account to create the campaign. It never turns on spend. The connection is stored encrypted, and you can disconnect it in Connections at any time.",
      description:
        "wovain writes several Meta ads for each piece and builds the campaign, ad set and ads in your ad account, all paused until you turn them on.",
      docsPath: "/docs/connecting-accounts#meta",
      faq: [
        {
          answer:
            "No. Every campaign, ad set and ad is created paused, and nothing spends until you approve the campaign. wovain then starts it, but only once its spend rules and Meta's automated rules are in place.",
          question: "Can wovain spend my ad budget?",
        },
        {
          answer:
            "Anything from $1 to $500 a day. Starting small is a good way to see which ad people respond to before you spend more.",
          question: "What daily budget can I set?",
        },
        {
          answer:
            "Up to three per product, each from a different angle, with one ad per variant inside one campaign.",
          question: "How many ads does wovain write?",
        },
        {
          answer:
            "Yes. They are normal objects in your ad account, so you can change the copy, audience or budget in Meta Ads Manager before you turn them on.",
          question: "Can I edit the ads before they run?",
        },
      ],
      lead: "Meta is where your ads run. wovain writes the ads and builds the whole campaign in your ad account, then stops: the campaign is created paused, so you decide when money starts moving.",
      name: "Meta",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup:
        "Open Connections in wovain and authorize your own Meta ad account and Page.",
      steps: [
        {
          body: "wovain writes up to three ads per product, each from a different angle, with its own headline and message.",
          title: "Write the ads",
        },
        {
          body: "You choose where the ads should show and a daily budget between $1 and $500. You can change both later in Meta.",
          title: "Pick countries and a budget",
        },
        {
          body: "wovain creates one campaign per product, an ad set and one ad per variant in your ad account. Every object is created paused.",
          title: "Build the campaign, paused",
        },
        {
          body: "Check the ads, audience and budget, in wovain or in Meta Ads Manager, then approve the campaign when you are ready to spend. wovain starts it once its spend rules are in place.",
          title: "Review and approve",
        },
      ],
      title:
        "Meta ads for your label's drops, built for you and created paused",
    },
  },
};

export default content;
