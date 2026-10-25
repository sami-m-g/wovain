import type { SiteContent } from "@/content/types";

const content: SiteContent = {
  cases: {
    "band-merch": {
      description:
        "Plan band merch around a release or tour: ideas from your fans' taste, print-checked designs, Fourthwall products priced for profit and a paused Meta campaign.",
      exampleBrief:
        "Merch for our new shoegaze EP, faded film-photo look, for fans who also love 90s indie.",
      faq: [
        {
          answer:
            "wovain lists products in your Fourthwall shop, which is made for online orders. Stock for a merch table is a separate order outside wovain.",
          question: "Can I sell merch at shows with wovain?",
        },
        {
          answer:
            "The same rule as tees: at least $10 profit and a 30% margin over the blank's base cost, whichever is higher.",
          question: "How are hoodies priced?",
        },
        {
          answer:
            "Yes, if you own it. You can describe it in the brief, and you approve every design before anything is made.",
          question: "Can we use our album art?",
        },
      ],
      lead: "Fans buy band merch to say they were there. wovain helps you build a drop around a release or tour, priced so every sale pays you, with the ads ready and paused.",
      name: "Band merch",
      related: ["fourthwall", "meta", "qloo", "tavily"],
      situation:
        "You play in a band or release music on your own. Merch matters, but the time goes into writing and playing, not into listings and ad settings. You want a few good pieces around the next release, sold online, with a margin you can count on.",
      steps: [
        {
          body: "Describe the record or tour, the visual feel and who listens.",
          title: "Brief from the release",
        },
        {
          body: "Qloo shows what your listeners also love, from films to fashion, and Tavily adds this week's news and checks the listings.",
          title: "Pick ideas",
        },
        {
          body: "Each design is checked for print size and fit. Approve, reject or ask for changes.",
          title: "Approve the designs",
        },
        {
          body: "Products go live on your shop when you publish, at a price that clears at least $10 per sale.",
          title: "Publish on Fourthwall",
        },
        {
          body: "Up to three ad variants wait in a paused campaign. Turn it on around release day.",
          title: "Ads for release week",
        },
      ],
      tips: [
        "Tie the drop to the release: the artwork, a lyric you wrote or the tour dates.",
        "Keep other bands' names and album titles off the print. wovain saves the names it matched for your brief as names never to print.",
        "Print-on-demand pieces are made after the order, so they suit online sales and pre-orders more than a merch table on the night.",
        "Publish a few days before release so the link is ready for your posts and the release-day ads.",
        "Higher-cost blanks like hoodies get a price set by the 30% margin floor. A $35 blank sells at $50 and still leaves $12.",
      ],
      title: "Band merch: design, price and list a drop around your release",
    },
    "creator-merch": {
      description:
        "Plan creator merch from one sentence: ideas from your audience's taste, checked designs, Fourthwall products priced for profit and a paused Meta campaign.",
      exampleBrief:
        "Calm, minimal merch for my home-cooking channel, warm colours, no giant logo.",
      faq: [
        {
          answer:
            "Research and the first design take a few minutes. The rest depends on how long you spend choosing and approving.",
          question: "How long does a drop take?",
        },
        {
          answer:
            "No. You approve or give feedback in plain words, and wovain makes another design for the same idea.",
          question: "Do I need design skills?",
        },
        {
          answer:
            "The blank's base cost, card fees and the reserve wovain plans for refunds. The price is set so you keep at least $10 per sale after those.",
          question: "What does it cost me per sale?",
        },
        {
          answer:
            "It works with the blanks in the Fourthwall catalog. wovain starts with print-on-demand and is growing toward apparel made to order.",
          question: "Is it only for T-shirts?",
        },
      ],
      lead: "You know your audience. What eats the time is the research, the artwork, the listings and the ad set-up. wovain does those, and you approve each step.",
      name: "Creator merch",
      related: ["fourthwall", "meta", "qloo", "nebius"],
      situation:
        "You make videos, posts or a podcast, and people keep asking for merch. You have a Fourthwall shop, or you are about to open one, but a drop means a week of research, design files, pricing sums and Ads Manager settings. You want products your fans would actually wear, at a price that leaves you a real profit.",
      steps: [
        {
          body: "Say who the drop is for and how it should feel. That is the whole brief.",
          title: "Write one sentence",
        },
        {
          body: "wovain shows ideas scored by what your audience also loves, this week's news and how crowded the listings are, with sources.",
          title: "Pick from ranked ideas",
        },
        {
          body: "Each design arrives with a check from NVIDIA Nemotron: verdict, score and fixes. Approve it, or say what to change and get a new one.",
          title: "Approve the designs",
        },
        {
          body: "Approved designs become hidden products on real blanks, priced for at least $10 profit per sale. Publish when you are happy.",
          title: "Publish on Fourthwall",
        },
        {
          body: "wovain writes up to three ad variants and builds a Meta campaign that is created paused. You turn it on when you are ready.",
          title: "Review the paused campaign",
        },
      ],
      tips: [
        'Write the brief about your audience, not your logo. "Fans of slow cooking who like linen and earthy colours" gives better ideas than "my channel logo on a hoodie".',
        'Say what to avoid. "Nothing too punny" or "no neon" saves a round of feedback.',
        "Start with one or two products. A small drop is easier to talk about and quicker to judge.",
        "Read the sources on the idea you pick. If the news behind it will be old in a month, launch soon or pick a steadier theme.",
        "Start the campaign on a small daily budget and look at which angle people click before you spend more.",
      ],
      title: "Creator merch without the busywork: one brief to a ready drop",
    },
    "twitch-merch": {
      description:
        "Plan Twitch merch from a short brief: ideas tied to your community's taste, print-checked designs, Fourthwall products priced for profit and paused Meta ads.",
      exampleBrief:
        'Merch for my cozy farming-sim streams, soft pastel colours, built around our chat\'s "one more day" joke.',
      faq: [
        {
          answer:
            "Emotes your community made for you are a good fit, as long as you own the art. Avoid game art and other creators' work.",
          question: "Can I put emotes on merch?",
        },
        {
          answer:
            "It depends on the blank. A $12 blank comes out at $24, which leaves about $10.33 after fees and the refund reserve.",
          question: "What will a typical tee cost my viewers?",
        },
        {
          answer:
            "No. The campaign is created paused. You can sell only to your stream and turn ads on later, or never.",
          question: "Do I have to run ads?",
        },
      ],
      lead: "Your chat already writes your best merch: emotes, running jokes, the moments everyone clipped. wovain helps you turn them into products and ads without a week of set-up.",
      name: "Twitch merch",
      related: ["fourthwall", "meta", "tavily", "nebius"],
      situation:
        "You stream on Twitch and your community has its own language. You want merch that regulars recognise, ready in time for a milestone or event stream, and priced so each sale is worth it.",
      steps: [
        {
          body: "Name the game or genre, the feel and the running joke you want on the product.",
          title: "Brief with the in-joke",
        },
        {
          body: "wovain ranks ideas by your audience's wider taste and this week's news, and shows how many similar listings exist.",
          title: "Pick ideas",
        },
        {
          body: "Check the verdict and fixes, approve the ones you would wear on stream, or ask for another.",
          title: "Approve the designs",
        },
        {
          body: "Publish on Fourthwall ahead of your milestone or event stream so the link is ready.",
          title: "Publish before the stream",
        },
        {
          body: "Your Meta campaign waits, paused, until you want to reach people outside your chat.",
          title: "Reach new viewers",
        },
      ],
      tips: [
        "Time the drop to something your community already celebrates: a follower milestone, an anniversary stream or a charity event.",
        "Wear or show the product on stream. People buy what they have seen in use.",
        "Add the shop link to your panels and a chat command so it is one click away during the stream.",
        "Keep game logos and characters off the print unless you have the rights. In-jokes your chat invented are yours to use.",
        "Give it a few days after publishing before a big shout-out, so you can check the product page first.",
      ],
      title: "Twitch merch: turn your chat's in-jokes into a drop",
    },
    "youtube-merch": {
      description:
        "Plan YouTube merch from one brief: ideas from what your viewers love, designs checked for print, Fourthwall products at a real profit and paused Meta ads.",
      exampleBrief:
        "Merch for my vintage synth repair channel, retro manual-cover style, for people who love fixing old gear.",
      faq: [
        {
          answer:
            "No. The price is set so each sale clears at least $10, so a small drop to a loyal audience still pays for itself per order.",
          question: "Do I need a big channel to sell merch?",
        },
        {
          answer:
            "Yes, if it is yours. wovain keeps names of other brands, artists and titles it matched for your topic off the print.",
          question: "Can I use my channel name or logo?",
        },
        {
          answer:
            "No. The campaign is created paused. Nothing spends until you turn it on in Meta.",
          question: "Will ads run as soon as I publish?",
        },
      ],
      lead: "Your viewers already have in-jokes, recurring segments and a feel they recognise. wovain turns that into a drop on Fourthwall and a paused Meta campaign, and asks you at every step.",
      name: "YouTube merch",
      related: ["fourthwall", "meta", "qloo", "tavily"],
      situation:
        "You run a YouTube channel and your comments keep asking for merch. You want something that fits the channel without being a logo slapped on a tee, and you want to talk about it in a video without worrying that the price leaves you nothing.",
      steps: [
        {
          body: "Describe the channel's topic and the feel of the drop in one sentence.",
          title: "Brief from your channel",
        },
        {
          body: "Ideas come ranked by what your viewers also love and by this week's news, with the listings check showing how crowded each one is.",
          title: "Pick ideas with a reason",
        },
        {
          body: "Every design comes with a print-size check and a judge's score. Approve, or ask for changes.",
          title: "Approve checked designs",
        },
        {
          body: "Publish the products on Fourthwall, then mention them in your next video with the link ready.",
          title: "Publish, then film",
        },
        {
          body: "The Meta campaign is waiting, paused. Turn it on to reach people beyond your subscribers.",
          title: "Turn on ads when you want reach",
        },
      ],
      tips: [
        "Build the drop around a recurring segment or catchphrase your regular viewers know. It reads as a wink to fans, not an advert.",
        "Publish before you film the mention, so the link works the moment the video goes live.",
        "Put the product link in the description and a pinned comment, and say it out loud once in the video.",
        "If your channel is eligible for YouTube Shopping, Fourthwall can connect to it so products show alongside your videos. Check eligibility in your YouTube and Fourthwall settings.",
        "Use the ad angle that matches how you talk on camera. If you are dry and technical, pick the variant that is too.",
      ],
      title: "YouTube merch: plan a drop your viewers will actually wear",
    },
  },
  guides: {
    "launch-a-merch-drop": {
      description:
        "A practical guide to launching a merch drop: research, designs and print checks, approval, publishing on Fourthwall, ad variants and a paused Meta campaign.",
      faq: [
        {
          answer:
            "One or two. It is easier to explain, easier to promote and quicker to learn from than a large collection.",
          question: "How many products should a first drop have?",
        },
        {
          answer:
            "Start small, a few dollars a day, and only raise the budget on the variant that gets results. Your profit per sale sets the limit.",
          question: "How much should I spend on Meta ads for merch?",
        },
        {
          answer:
            "Yes: research, designs with checks, Fourthwall products and a paused Meta campaign. You approve each step, and you turn the campaign on.",
          question: "Does wovain do all of this?",
        },
        {
          answer:
            "Yes. Publish the products and share them yourself. The paused campaign can wait until you want more reach.",
          question: "Can I launch without ads?",
        },
      ],
      lead: "A merch drop has six parts: research, design, checks, approval, publishing and ads. Here is how to run each one, what to check before money starts moving, and a checklist to keep.",
      published: "2026-10-25",
      readingMinutes: 5,
      sections: [
        {
          heading: "Research: taste, timing and how crowded it is",
          paragraphs: [
            "Good merch ideas sit where three things meet. Your audience likes the theme. Something about it is in the air this week. And not too many shops already sell it.",
            "Taste comes first. Ask what the people who watch, listen or read you also love: the films, music, hobbies and styles they share. A plant channel's viewers might also love slow living and hiking, and that is a richer seam than another leaf on a tee.",
            "Then timing. Look at the past week's news inside that theme. A season, an anniversary or a release gives the drop a reason to exist now, and something to say in the ad.",
            "Last, check the listings. Search marketplaces such as Etsy, Redbubble and Fourthwall for the idea. If there are hundreds of near-copies, your version has to be much better, or you should pick another angle.",
            "Write down why each idea made the list: the taste link, the news and the listing count. You will reuse those reasons later in the ad copy, and they help you drop ideas that only looked good for a day.",
          ],
        },
        {
          heading: "Design, then check before anyone sees it",
          list: [
            "Print size: the art file must be big enough for the print area. wovain fails anything narrower than 2880 px.",
            "Colours: the ink must read on the garment colour. Dark art on a dark tee disappears.",
            "Listing: a clear title and a description that says what the product is, without overpromising.",
            "Originality: no other brands, artists, film titles or characters unless you have the rights.",
          ],
          paragraphs: [
            "Turn the idea into a short brief: what is printed, the style, the garment colours and anything to avoid. Then make a few candidates rather than one.",
            "Check each design against the boring rules before you fall in love with it. A design that fails one of these is cheaper to fix now than after a customer opens the parcel.",
            "In wovain, each design arrives with a check from NVIDIA Nemotron: a verdict of ready or revise, a score out of 100 and up to five fixes. The print-size rule is decided by code, so a file that is too small never passes.",
          ],
        },
        {
          heading: "Approve with a reason",
          paragraphs: [
            'Approval is where you add what no tool can: your sense of your audience. Approve the designs you would wear yourself. Reject the rest with one line on why, such as "type too thin" or "drop the leaves", so the next round is better.',
            "One or two strong products beat six average ones. A small drop is easier to explain in a video and quicker to learn from.",
          ],
        },
        {
          heading: "Publish on Fourthwall at a price that pays",
          paragraphs: [
            "Create each product on the blank you chose and set a price that clears your floor after fees. A simple rule is at least $10 profit per sale and a 30% margin, whichever is higher: a $12 tee sells at $24, a $25 blank at $38.",
            "Keep the product hidden until the page looks right: photos, title, sizes and price. Then publish, and open the live page once as a buyer would.",
            "Publish before you announce. A video or post that goes out while the product is still hidden sends people to a dead link, and that first wave of attention is hard to win back.",
          ],
        },
        {
          heading: "Write ad variants from different angles",
          paragraphs: [
            "One ad tells you very little. Two or three, each from a different angle, tell you what your audience responds to.",
            'Pick angles that are actually different: the in-joke (for people who already know you), the identity ("for people who fix their own synths"), and the moment (this week\'s reason to buy). Give each its own headline and message, and keep the same product so the angle is the only change.',
            'Keep the copy short and true. Say what the product is, who it is for and why now. Skip claims you cannot back, such as "best-selling" on a product that launched today.',
          ],
        },
        {
          heading: "Why the campaign starts paused, and how to pick a budget",
          paragraphs: [
            "A campaign that goes live the moment it is built can spend before anyone has read the ads. Building it paused gives you a calm moment to check everything, and nothing is spent until you decide.",
            "For the daily budget, start small. A few dollars a day per campaign is enough to see which variant gets clicks, without risking much. Remember that ad spend comes out of your profit per sale, so a $10 margin leaves little room for expensive clicks. Raise the budget only on the variant that is working. wovain accepts a daily budget from $1 to $500, and you can change it in Meta at any time.",
            "Give each test a few days before you judge it. One quiet afternoon says little; a pattern over several days says more.",
          ],
        },
        {
          heading: "Your pre-launch checklist",
          list: [
            "The product is published and the live page loads on your phone.",
            "Price, sizes and colours on the page are what you approved.",
            "Each ad links to the right product.",
            "The headline and message read well and promise nothing the product does not do.",
            "The countries match where you want to sell.",
            "The daily budget is one you are happy to spend every day.",
            "You have a video, post or stream planned to mention the drop.",
            "You know when you will look at the results, such as after three days.",
          ],
          paragraphs: [
            "Go through this before you turn the campaign on. It takes ten minutes and catches most mistakes.",
          ],
        },
      ],
      title: "How to launch a merch drop: from idea to a paused Meta campaign",
    },
    "price-print-on-demand-merch": {
      description:
        "A plain guide to pricing print-on-demand merch: base cost, card fees, tax and refunds, a $10 profit floor and a 30% margin floor, with worked examples.",
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
      lead: "Most merch pricing goes wrong in the same way: base cost plus a round number, and the fees eat the rest. Here is a simple rule that keeps at least $10 per sale, with the sums shown.",
      published: "2026-10-25",
      readingMinutes: 5,
      sections: [
        {
          heading: "Start from the base cost",
          paragraphs: [
            "Every print-on-demand product starts with a base cost: what the platform charges to print and make one item on a given blank. A basic tee might be $12, a heavier tee $15, a hoodie $25 to $35. It changes with the blank, the print area and sometimes the colour.",
            "The base cost is the one number you cannot negotiate per sale, so it is where pricing should begin. Look it up for the exact blank and print you plan to sell, not for the cheapest version of that product.",
            'The mistake is to stop there and add a round number. "Base cost plus $10" sounds like $10 profit, but it is not. Several small costs come out of every sale before the money reaches you.',
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
            "The profit floor: after the base cost, card fees and refund reserve, each sale leaves at least $10. That is enough to be worth a sale, a shout-out and a customer email. You can choose a different number, but pick one and stick to it.",
            "The margin floor: the gap between price and base cost is at least 30% of the price, written as (price − base cost) ÷ price ≥ 30%. A flat $10 is a lot on a $12 tee but thin on a $35 hoodie. The margin floor makes sure pricier items keep a fair share, so one refund or a small fee change does not leave you at zero.",
            "Take whichever floor gives the higher price, then round up to a whole dollar. Whole-dollar prices are easier to read and easier to say out loud in a video.",
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
            "The floors are a minimum, not a target. Some drops can and should sell above them.",
            "Price higher when the item is limited, such as a tour or anniversary run, when the design took real work or a collaborator needs paying, or when your audience already buys at higher prices elsewhere. Price higher too if you plan to run ads: ad spend comes out of that $10, so a product that needs paid reach needs more room.",
            "Price near the floor when the goal is reach rather than income: a first drop, a low-cost item fans can buy on impulse, or a piece you want seen at a meet-up. Even then, do not go below the floor. A sale that leaves $3 is not worth the support load.",
            "Whatever you choose, check the real numbers for your shop. Tax rates, shipping and fees vary by country and platform, so use the rule with your own inputs.",
          ],
        },
        {
          heading: "How wovain applies this for you",
          paragraphs: [
            "wovain uses exactly this rule. When a design becomes a product, wovain reads the real base cost of the Fourthwall blank, then sets the lowest whole-dollar price that clears both $10 profit and a 30% margin after card fees, sales tax and a 2% refund reserve. The price, profit and margin are shown with the product, so you can see the sum, not just the answer.",
            "The rule lives in code, not in a prompt, so autopilot cannot skip it. Products are created hidden, so you can change the price in Fourthwall before you publish if you want to sit above the floor.",
          ],
        },
      ],
      title: "How to price print-on-demand merch so every sale clears a profit",
    },
  },
  integrations: {
    chatgpt: {
      category: "Chat app (MCP server)",
      connection: "yours",
      data: "ChatGPT sends your requests to wovain's tools. wovain uses the same account, runs and connections as the website, so you can start a drop in chat and finish it on the web.",
      description:
        "Add wovain to ChatGPT as an app and run a merch drop in plain words: research, designs, Fourthwall products and a paused Meta campaign, with your approval.",
      docsPath: "/docs/seller-guide",
      faq: [
        {
          answer:
            "Yes. The same agents, approvals and rules run in both places, and runs started in ChatGPT appear in your history on the website.",
          question: "Is it the same as the website?",
        },
        {
          answer:
            "Yes. Ask for a run with autopilot on. It goes through to a published product and a paused campaign, with the same code checks as on the web.",
          question: "Can I use autopilot from ChatGPT?",
        },
        {
          answer:
            "Yes. ChatGPT gives you a connect link for each one, and you authorize your own shop and ad account.",
          question: "Do I still connect Fourthwall and Meta?",
        },
      ],
      lead: "If you already plan in ChatGPT, you can run your drop there too. wovain is an MCP server: add it as an app, ask for a drop, and say yes at each step.",
      name: "ChatGPT",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup:
        "In ChatGPT, open Settings → Apps → Create, paste https://mcp.wovain.com/api/mcp, then sign in to wovain and allow access.",
      steps: [
        {
          body: "In ChatGPT go to Settings → Apps → Create and paste the MCP server URL, https://mcp.wovain.com/api/mcp.",
          title: "Add wovain as an app",
        },
        {
          body: "ChatGPT opens the wovain sign-in page. After you sign in, a consent screen asks you to allow ChatGPT to use your wovain account.",
          title: "Sign in and allow access",
        },
        {
          body: "If you have not connected them yet, ask ChatGPT to list your connections. It returns a link for each one you still need to authorize.",
          title: "Connect Fourthwall and Meta",
        },
        {
          body: 'Say what you want in plain words, such as "research trends for retro hiking gear". ChatGPT runs the research and the first design.',
          title: "Ask for a drop",
        },
        {
          body: "ChatGPT asks you before it approves a design, creates or publishes products, or builds the campaign. The campaign is still created paused.",
          title: "Approve each step",
        },
      ],
      title: "wovain in ChatGPT: plan and launch a merch drop from a chat",
    },
    fourthwall: {
      category: "Print-on-demand shop and catalog",
      connection: "yours",
      data: "wovain reads catalog blanks and base costs, and sends your approved artwork, title, description and price to create products in your shop. The Fourthwall grant is stored sealed (encrypted), and you can disconnect it in Connections at any time.",
      description:
        "Connect your Fourthwall shop to wovain. Approved designs become products on real blanks, priced to clear $10 profit a sale, and stay hidden until you publish.",
      docsPath: "/docs/integrations/fourthwall",
      faq: [
        {
          answer:
            "Yes. wovain creates products in the shop you connect, so they are yours from the start. You keep running the shop in Fourthwall as usual.",
          question: "Do I need my own Fourthwall shop?",
        },
        {
          answer:
            "No. Products are created hidden and go live when you publish them. The one exception is autopilot, which you switch on yourself for a run.",
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
      lead: "Fourthwall is where your merch is listed and sold. wovain reads its catalog for real blanks and base costs, then turns the designs you approve into products in your own shop.",
      name: "Fourthwall",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup:
        "Sign in to wovain, open Connections and authorize your own Fourthwall shop on one consent screen.",
      steps: [
        {
          body: "wovain looks up real Fourthwall blanks and their base costs, so every price, profit and margin you see is a real number, not a guess.",
          title: "Read the catalog",
        },
        {
          body: "The price starts from the blank's base cost and clears at least $10 profit and a 30% margin after card fees, sales tax and a refund reserve. A $12 blank sells at $24.",
          title: "Price each product",
        },
        {
          body: "Your approved artwork is uploaded and the product is created with its title, description and price. It stays hidden, so nothing appears in your shop yet.",
          title: "Create the product, hidden",
        },
        {
          body: "You check the product and press publish. Only then does it go live in your shop. On autopilot, wovain publishes for you after every check passes.",
          title: "Publish when you say so",
        },
      ],
      title:
        "Fourthwall and wovain: from approved design to a product in your shop",
    },
    meta: {
      category: "Ad account, Page and pixel",
      connection: "yours",
      data: "wovain sends the ad copy, the product link and the countries and budget you chose to your ad account to create the campaign. It never activates spend. The Meta grant is stored sealed (encrypted), and you can disconnect it in Connections at any time.",
      description:
        "wovain writes up to three Meta ad variants for each product and builds the campaign, ad set and ads in your ad account, all paused until you turn them on.",
      docsPath: "/docs/integrations/meta-ads",
      faq: [
        {
          answer:
            "No. Every campaign, ad set and ad is created paused, and wovain never turns them on. Spending starts only when you activate the campaign in Meta.",
          question: "Can wovain spend my ad budget?",
        },
        {
          answer:
            "Anything from $1 to $500 a day. Starting small is a good way to see which variant people respond to before you spend more.",
          question: "What daily budget can I set?",
        },
        {
          answer:
            "Up to three variants per product, each from a different angle, with one ad per variant inside one campaign.",
          question: "How many ads does wovain make?",
        },
        {
          answer:
            "Yes. They are normal objects in your ad account, so you can change the copy, audience or budget in Meta Ads Manager before you turn them on.",
          question: "Can I edit the ads before they run?",
        },
      ],
      lead: "Meta is where your ads run. wovain writes the ad variants and builds the whole campaign in your ad account, then stops: the campaign is created paused, so you decide when money starts moving.",
      name: "Meta",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup:
        "Open Connections in wovain and authorize your own Meta ad account, which brings in your Page and pixel.",
      steps: [
        {
          body: "NVIDIA Nemotron writes up to three variants per product, each from a different angle, with its own headline and message.",
          title: "Write the ad variants",
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
          body: "Open the campaign in Meta Ads Manager, check the ads, audience and budget, and turn it on when you are ready to spend.",
          title: "Review and turn it on in Meta",
        },
      ],
      title: "Meta ads for your merch, built for you and created paused",
    },
    nebius: {
      category: "Design judge, writer and autopilot",
      connection: "wovain",
      data: "wovain sends the idea, brief, listing and artwork facts such as size to Nemotron, and stores the replies (verdicts, scores and reasons) on your design and run.",
      description:
        "wovain runs NVIDIA Nemotron on Nebius Token Factory to write listings, judge each design, write ad copy and drive autopilot, with code checks it cannot skip.",
      docsPath: "/docs/integrations/nebius-nemotron",
      faq: [
        {
          answer:
            "No. Price, the $1 to $500 budget range and the paused campaign are all enforced by code. Nemotron writes and judges; it does not change those rules.",
          question: "Does the AI set my prices?",
        },
        {
          answer:
            "No. If the judge says revise, the design is not approved, whatever the autopilot reply says.",
          question: "Can autopilot approve a design the judge flagged?",
        },
        {
          answer:
            "NVIDIA Nemotron 3 Super, served by Nebius Token Factory. Every reply is checked against a fixed shape before wovain uses it.",
          question: "Which model is it?",
        },
        {
          answer: "No. It runs on wovain's own key.",
          question: "Do I need a Nebius account?",
        },
      ],
      lead: "wovain uses NVIDIA Nemotron on Nebius Token Factory for four small jobs: write the brief and listing, judge the design, write the ads, and decide on autopilot. Hard rules like price and print size stay in code.",
      name: "Nebius · NVIDIA Nemotron",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup: "Nothing to do. Nemotron runs on wovain's own Nebius key.",
      steps: [
        {
          body: "Nemotron turns a picked idea into the art prompt, title, description and garment colours.",
          title: "Write the brief and listing",
        },
        {
          body: "It returns a verdict (ready or revise), a score out of 100, checks on title, description, fit and originality, and up to five fixes. Art narrower than 2880 px fails in code, whatever the model says.",
          title: "Judge the design",
        },
        {
          body: "It writes up to three ad variants, each with an angle, a headline and a message.",
          title: "Write the ad copy",
        },
        {
          body: "With autopilot on, it picks the most promising idea and approves or rejects the design, with a one-line reason for each. A design the judge flagged is never approved.",
          title: "Decide on autopilot",
        },
      ],
      title:
        "NVIDIA Nemotron on Nebius: the second pair of eyes on every design",
    },
    qloo: {
      category: "Taste graph",
      connection: "wovain",
      data: "wovain sends Qloo the topic from your brief and gets back related entities and taste tags. Nothing from your Fourthwall or Meta accounts is sent to Qloo.",
      description:
        "wovain uses Qloo's taste graph to find the themes your fans also love before it designs anything. It runs on wovain's own key, so there is nothing to set up.",
      docsPath: "/docs/integrations/qloo",
      faq: [
        {
          answer:
            "No. Qloo runs on wovain's own key, so you only write the brief.",
          question: "Do I need a Qloo account?",
        },
        {
          answer:
            "A map of what people who like one thing also tend to like. It answers the question a trend chart cannot: what would your fans actually wear?",
          question: "What is a taste graph?",
        },
        {
          answer:
            "It helps. Names Qloo matched for your topic are kept off the print. It is a safeguard, not legal advice, and you still approve every design.",
          question: "Does it keep me clear of other people's trademarks?",
        },
      ],
      lead: "Most merch ideas start from what is in the news. wovain starts from your audience: Qloo's taste graph shows which themes the fans of your topic also love, and the designs follow from there.",
      name: "Qloo",
      related: ["creator-merch", "band-merch"],
      setup: "Nothing to do. Qloo runs on wovain's own key.",
      steps: [
        {
          body: "The topic in your brief, such as a channel niche, a fandom or a style, is matched to things Qloo knows about.",
          title: "Read your brief",
        },
        {
          body: "Qloo returns the tastes that the fans of those things share across music, film, food, travel and more. These become the themes for ideas.",
          title: "Find the taste themes",
        },
        {
          body: "Brands, artists and titles Qloo matched for your topic are saved with the idea as names never to print, and the design brief avoids them.",
          title: "Keep names off the print",
        },
        {
          body: "Tavily then looks for this week's news and existing listings inside those themes, so every idea has both taste and timing behind it.",
          title: "Hand off to the news check",
        },
      ],
      title: "Qloo in wovain: find what your audience already loves",
    },
    tavily: {
      category: "News and listing search",
      connection: "wovain",
      data: "wovain sends search queries built from the themes of your brief and keeps the results with their source links. Web text is treated as data only, never as instructions.",
      description:
        "wovain uses Tavily to check this week's news for each merch idea and how many similar listings already exist. Sources stay attached, and you set up nothing.",
      docsPath: "/docs/integrations/tavily",
      faq: [
        {
          answer: "No. Tavily runs on wovain's own key.",
          question: "Do I need a Tavily account?",
        },
        {
          answer:
            "Etsy, Redbubble and Fourthwall. If many listings already match an idea, it scores lower.",
          question: "Which marketplaces does it check?",
        },
        {
          answer:
            "Yes. Each idea shows its sources, so you can open the news behind it before you choose.",
          question: "Can I see where an idea came from?",
        },
      ],
      lead: "A good idea at the wrong moment is a slow seller. Tavily gives each idea its why-now from the past week's news, and checks how many shops already sell something like it.",
      name: "Tavily",
      related: ["creator-merch", "youtube-merch", "twitch-merch"],
      setup: "Nothing to do. Tavily runs on wovain's own key.",
      steps: [
        {
          body: "For each taste theme from Qloo, Tavily searches the past week's news. The results become the idea's why-now, with links.",
          title: "Search this week's news",
        },
        {
          body: "Tavily searches Etsy, Redbubble and Fourthwall for matching listings. Fewer matches mean a less crowded idea, which scores higher.",
          title: "Check the listings",
        },
        {
          body: "Every idea keeps its source links, so you can read why it was suggested before you pick it.",
          title: "Attach the sources",
        },
      ],
      title:
        "Tavily in wovain: this week's news and how crowded the listings are",
    },
  },
};

export default content;
