# Changelog

## [0.32.0](https://github.com/sami-m-g/wovain/compare/v0.31.0...v0.32.0) (2026-10-30)


### Features

* **ads:** a drop launches as a multi-design test, with per-design results ([#173](https://github.com/sami-m-g/wovain/issues/173)) ([0abf6e6](https://github.com/sami-m-g/wovain/commit/0abf6e6c9030527caf34a17a5dfe5eb782a4dec2))
* **ads:** mirror the kill and stop rules into Meta's automated rules ([#215](https://github.com/sami-m-g/wovain/issues/215)) ([4ec43ea](https://github.com/sami-m-g/wovain/commit/4ec43ea1494a2443d2569345e5b5c70bb5debd01))
* **ads:** no campaign without a Qloo audience; remove qloo-audiences ([#161](https://github.com/sami-m-g/wovain/issues/161)) ([78bdf94](https://github.com/sami-m-g/wovain/commit/78bdf947df7f3779f3f5f1b059cb1c99ff282a9f))
* **ads:** profit kill, stop and scale rules every 30 minutes ([#141](https://github.com/sami-m-g/wovain/issues/141)) ([3dc4979](https://github.com/sami-m-g/wovain/commit/3dc497944ab0865a2ba98409e8610a075394f3fc))
* **ads:** qloo demographics and audiences drive meta targeting and the ad persona ([#75](https://github.com/sami-m-g/wovain/issues/75)) ([d636953](https://github.com/sami-m-g/wovain/commit/d63695398696f67fa04c28045fed3067ddebf216))
* **ads:** thompson-sampling ads optimizer behind the ads-optimizer flag ([#70](https://github.com/sami-m-g/wovain/issues/70)) ([3fe9b12](https://github.com/sami-m-g/wovain/commit/3fe9b1246f10589da0569ef6a419166eb58d5f12))
* **alerts:** one service for email, mobile push and Telegram alerts ([#204](https://github.com/sami-m-g/wovain/issues/204)) ([4ed502e](https://github.com/sami-m-g/wovain/commit/4ed502e4033162f80969cc9395a6ad03b2327a06))
* **app:** connect states instead of not-connected errors ([#112](https://github.com/sami-m-g/wovain/issues/112)) ([64c3ec8](https://github.com/sami-m-g/wovain/commit/64c3ec84a66bb50c1d0b44976cae3c701fb30129))
* **auth:** shared judges demo account on next with an account-only promo ([#97](https://github.com/sami-m-g/wovain/issues/97)) ([62883f3](https://github.com/sami-m-g/wovain/commit/62883f382418c7d2f3f3a61b9c1753220279581b)), closes [#96](https://github.com/sami-m-g/wovain/issues/96)
* **autopilot:** scheduled qloo and tavily triggers that act within the autonomy level ([#78](https://github.com/sami-m-g/wovain/issues/78)) ([96ef05e](https://github.com/sami-m-g/wovain/commit/96ef05e7518fb2376448c4261c89bd8536eeef1b))
* **billing:** price credits on cost now that designs draw on wovain's fal ([#136](https://github.com/sami-m-g/wovain/issues/136)) ([6035709](https://github.com/sami-m-g/wovain/commit/60357090f07bbaaf67eaea16dccc2ccc320db638))
* **competition:** read the tavily competitive landscape per qloo theme ([#108](https://github.com/sami-m-g/wovain/issues/108)) ([b6f28ac](https://github.com/sami-m-g/wovain/commit/b6f28acafa79cf414f56e422f8d87a7d7d1df585)), closes [#106](https://github.com/sami-m-g/wovain/issues/106)
* **config:** move per-environment values into env vars set from Pulumi config ([#45](https://github.com/sami-m-g/wovain/issues/45)) ([820c53f](https://github.com/sami-m-g/wovain/commit/820c53ffdd4bfed391803ce31d17f3093070f796))
* **core:** autonomy levels, one approval queue, decision traces and model routing config ([#60](https://github.com/sami-m-g/wovain/issues/60)) ([63a7c0d](https://github.com/sami-m-g/wovain/commit/63a7c0d5ac3a7867ad324bb73282c488fb0383ea))
* **core:** no idea without Qloo affinity; retire qloo-taste-map ([#162](https://github.com/sami-m-g/wovain/issues/162)) ([c38936a](https://github.com/sami-m-g/wovain/commit/c38936abfdecebc01a0fe808fa7bcf5dfcf495f5)), closes [#159](https://github.com/sami-m-g/wovain/issues/159)
* **core:** route nemotron agents by job, ground copy, score ads and trace models ([#74](https://github.com/sami-m-g/wovain/issues/74)) ([3a6b1c0](https://github.com/sami-m-g/wovain/commit/3a6b1c0a669df620efa40a63381f7e9e96b4c62b))
* **drops:** capsules with placement plans, art per art type and cost-based prices ([#91](https://github.com/sami-m-g/wovain/issues/91)) ([dd45461](https://github.com/sami-m-g/wovain/commit/dd45461ba915bff38630df2e8ff17a6eb3287bf9))
* **drops:** each drop's own tone and palette from its Qloo audience ([#122](https://github.com/sami-m-g/wovain/issues/122)) ([829b681](https://github.com/sami-m-g/wovain/commit/829b681c4685560a90c773a599a409859eeabc2d))
* **drops:** what to sell now in the new-drop step, brand optional ([#140](https://github.com/sami-m-g/wovain/issues/140)) ([a628c20](https://github.com/sami-m-g/wovain/commit/a628c20b4455d71b90c0b5aa822d315fe81f5bff))
* **drops:** what to sell now ranks on proof of demand ([#183](https://github.com/sami-m-g/wovain/issues/183)) ([c32d82a](https://github.com/sami-m-g/wovain/commit/c32d82ad48469e12b36f105ae351afd9b98503dc))
* **email:** one-click unsubscribe, reply-to and tracking off ([#198](https://github.com/sami-m-g/wovain/issues/198)) ([da79cf8](https://github.com/sami-m-g/wovain/commit/da79cf890aaf4973c7daf1667d4e6c0874d79602))
* **feedback:** learn from sales and ad results ([#83](https://github.com/sami-m-g/wovain/issues/83)) ([27c0167](https://github.com/sami-m-g/wovain/commit/27c0167b74b7db1646b181b2cdede11e8e0e2868))
* **feedback:** learn per merchant from real design outcomes ([#202](https://github.com/sami-m-g/wovain/issues/202)) ([6887b21](https://github.com/sami-m-g/wovain/commit/6887b21d683688f2b64500043a2450528186b0d5))
* **flags:** PostHog feature flags, and PostHog config managed by Pulumi ([#7](https://github.com/sami-m-g/wovain/issues/7)) ([e585b3b](https://github.com/sami-m-g/wovain/commit/e585b3b79552dfd08a3f7e10b4cee8bda535ca57))
* **ideas:** a greyed Without Qloo panel from the committed ablation ([#169](https://github.com/sami-m-g/wovain/issues/169)) ([d923234](https://github.com/sami-m-g/wovain/commit/d92323422b7b3d98d84167e8af1ea38beba36483))
* **ideas:** one idea card, an evidence gate and an honest sweet-spot rank ([#203](https://github.com/sami-m-g/wovain/issues/203)) ([b725dc6](https://github.com/sami-m-g/wovain/commit/b725dc6f0d73d4b5ae43a47adf605b9bd8ac97ee))
* **ideas:** rank ideas by the merchant's track record ([#214](https://github.com/sami-m-g/wovain/issues/214)) ([92247fb](https://github.com/sami-m-g/wovain/commit/92247fbe5480a53e3c2f61e0fc1cbc82e82c7442))
* **ideas:** who buys this and where, from Qloo, before any connector ([#154](https://github.com/sami-m-g/wovain/issues/154)) ([6cfcdc6](https://github.com/sami-m-g/wovain/commit/6cfcdc64e23b31bbe06d9b4e5b36a0e30b82891b))
* **infra:** declare PostHog's authorized domains, replay and heatmaps ([#52](https://github.com/sami-m-g/wovain/issues/52)) ([f6ccfa6](https://github.com/sami-m-g/wovain/commit/f6ccfa6157d84056c60abd20c172151f9aad6033))
* **infra:** delete the released App Hosting and Firebase leftovers (2/2) ([#48](https://github.com/sami-m-g/wovain/issues/48)) ([94ad028](https://github.com/sami-m-g/wovain/commit/94ad0284f4ac2c372f042550946f67cac7257651))
* **infra:** deploy production from release/transcend and main to next.wovain.com ([#25](https://github.com/sami-m-g/wovain/issues/25)) ([bfbfe31](https://github.com/sami-m-g/wovain/commit/bfbfe314fb57d16241766f315ae4150ede8fbdc3))
* **infra:** give next.wovain.com its own pulumi stack ([#57](https://github.com/sami-m-g/wovain/issues/57)) ([b18a164](https://github.com/sami-m-g/wovain/commit/b18a164e1268f18c21d816641cb3fe5dbbe67447))
* **infra:** retire GitLab, App Hosting and Vercel leftovers through Pulumi (1/2) ([#47](https://github.com/sami-m-g/wovain/issues/47)) ([335207a](https://github.com/sami-m-g/wovain/commit/335207a1d9c0348d2dda056db896a012284c8a5d))
* **infra:** run Pulumi from GitHub Actions and move hand steps into code ([#50](https://github.com/sami-m-g/wovain/issues/50)) ([d4e58f6](https://github.com/sami-m-g/wovain/commit/d4e58f68edf94acb21c9e98f8d85fb76375115ea))
* **media:** start meta campaigns through approvals within spend caps ([#72](https://github.com/sami-m-g/wovain/issues/72)) ([e2076d3](https://github.com/sami-m-g/wovain/commit/e2076d30764bb0ac006283809cc932ac0d28feb4))
* **meta:** setup cards with deep links, Graph readiness on the single grant, reconnect ([#182](https://github.com/sami-m-g/wovain/issues/182)) ([6172e59](https://github.com/sami-m-g/wovain/commit/6172e599c5a465bc68ded856f82d7cfa3a2a91a0))
* model IDs as env vars set per environment by Pulumi config ([#28](https://github.com/sami-m-g/wovain/issues/28)) ([46fb062](https://github.com/sami-m-g/wovain/commit/46fb0629068139b57ba0629dd85e035cb7a82fa8))
* north star events, KPIs and PostHog dashboard ([#147](https://github.com/sami-m-g/wovain/issues/147)) ([7e71c3f](https://github.com/sami-m-g/wovain/commit/7e71c3fa3b0cd6073e32667cd09ff7d5df44f295))
* **onboarding:** guided brand discovery, Qloo-first starter brands ([#117](https://github.com/sami-m-g/wovain/issues/117)) ([9d8510d](https://github.com/sami-m-g/wovain/commit/9d8510d2922f97c0f4652e30b2db43c46fa06a69))
* **onboarding:** wizard with connection health, qloo brand identity and autonomy caps ([#76](https://github.com/sami-m-g/wovain/issues/76)) ([87304b0](https://github.com/sami-m-g/wovain/commit/87304b0d1bfa5dfe2f5ef25bff729935cb7cc832))
* **qloo:** taste map with explainability, cross-domain cues and an llm-only ablation ([#79](https://github.com/sami-m-g/wovain/issues/79)) ([2c6f2ad](https://github.com/sami-m-g/wovain/commit/2c6f2ad4f5e248f8edd654efa1ce8510c9592888))
* **research:** make Qloo load-bearing: no run without Qloo ([#109](https://github.com/sami-m-g/wovain/issues/109)) ([ac94eb4](https://github.com/sami-m-g/wovain/commit/ac94eb4d6f0b3bc23fd8d1d18f485c92038dc8e9)), closes [#107](https://github.com/sami-m-g/wovain/issues/107)
* **research:** tavily as the evidence layer ([#73](https://github.com/sami-m-g/wovain/issues/73)) ([8498123](https://github.com/sami-m-g/wovain/commit/8498123886410380412d6b5e8926c41519a32238))
* **runs:** draw designs only for ideas the merchant approves ([#21](https://github.com/sami-m-g/wovain/issues/21)) ([3bbd590](https://github.com/sami-m-g/wovain/commit/3bbd5907a28e22a485957a8583546992abfcd427))
* **security:** add sast, dependency, license, secret and sbom scanning ([#61](https://github.com/sami-m-g/wovain/issues/61)) ([468c477](https://github.com/sami-m-g/wovain/commit/468c477fb5e3ca6f63ebd7a2750fc001a9f29a0d))
* show Fourthwall's placement mockups under "On a shirt" ([#19](https://github.com/sami-m-g/wovain/issues/19)) ([349c61b](https://github.com/sami-m-g/wovain/commit/349c61b3d49a4bb738f03e01c5cf42a54f1bcdac))
* **store:** guided Meta pixel and payouts steps with exact Fourthwall pages ([#179](https://github.com/sami-m-g/wovain/issues/179)) ([55b7ffc](https://github.com/sami-m-g/wovain/commit/55b7ffcdfd15ba8a62369ae25113e218486f6424))
* **store:** price check against Fourthwall's cost in every size ([#170](https://github.com/sami-m-g/wovain/issues/170)) ([6673294](https://github.com/sami-m-g/wovain/commit/6673294a55314b0f1e829ce392b15f79f142d53c))
* **store:** product pages that sell, rewritten and approved from the Store ([#163](https://github.com/sami-m-g/wovain/issues/163)) ([cced679](https://github.com/sami-m-g/wovain/commit/cced6793c04720e2df61b58edd2723e46532b900))
* **store:** products becomes the store manager ([#139](https://github.com/sami-m-g/wovain/issues/139)) ([4a7f93e](https://github.com/sami-m-g/wovain/commit/4a7f93e422c5fa1898e11473c768ae101b07f059)), closes [#131](https://github.com/sami-m-g/wovain/issues/131)
* **store:** set up the Meta pixel on the single grant ([#212](https://github.com/sami-m-g/wovain/issues/212)) ([048812e](https://github.com/sami-m-g/wovain/commit/048812eb6bfca4c37a492c7af8942452f97cc064))
* **store:** store management on Fourthwall through the approval queue ([#87](https://github.com/sami-m-g/wovain/issues/87)) ([db3032e](https://github.com/sami-m-g/wovain/commit/db3032e64d60f2265aee058da01680cd79e079c4))
* **store:** store setup checklist for the tech steps ([#156](https://github.com/sami-m-g/wovain/issues/156)) ([2cb6e39](https://github.com/sami-m-g/wovain/commit/2cb6e39320c89fdff871a922f557a9025d44a77d))
* **voice:** dictation mic inside text fields ([#208](https://github.com/sami-m-g/wovain/issues/208)) ([da33e9f](https://github.com/sami-m-g/wovain/commit/da33e9f64d863c85b341ca679d61156be50c2d85))
* **voice:** hold-to-talk commands with confirm before execution ([#85](https://github.com/sami-m-g/wovain/issues/85)) ([a10de39](https://github.com/sami-m-g/wovain/commit/a10de39e43c7774c931f1c1229966813cb9fb2b7))
* **web:** a 4-item rail and a Home that tells the Qloo story ([#206](https://github.com/sami-m-g/wovain/issues/206)) ([d497516](https://github.com/sami-m-g/wovain/commit/d497516aa4bdc51d3d903945137f912a2bdb91e5))
* **web:** one concept, drop; capsule planning is a step of the drop ([#160](https://github.com/sami-m-g/wovain/issues/160)) ([6e75905](https://github.com/sami-m-g/wovain/commit/6e759052328acf2a770e4efc46c75698dfc3c920))
* **web:** one drop page read top to bottom, with Decided by Qloo marks ([#211](https://github.com/sami-m-g/wovain/issues/211)) ([d54f915](https://github.com/sami-m-g/wovain/commit/d54f9151429926518733e4214878ca7022241c22))
* **web:** one fixed idea card with a reason for every missing section ([#256](https://github.com/sami-m-g/wovain/issues/256)) ([768bb4a](https://github.com/sami-m-g/wovain/commit/768bb4aaf264b1d64e123e8988888263d2428e73))
* **web:** one guided onboarding to a running campaign in 10 minutes ([#180](https://github.com/sami-m-g/wovain/issues/180)) ([561fa47](https://github.com/sami-m-g/wovain/commit/561fa471ab22e492aa25108a0808b8cd0a6a7e78))


### Bug Fixes

* 4xx RPCs log at warn; dev web service scales to two instances ([#236](https://github.com/sami-m-g/wovain/issues/236)) ([da5ae1b](https://github.com/sami-m-g/wovain/commit/da5ae1bcd82a9ebe21ca68d3971035483059a75a))
* **alerts:** claim before sending; Telegram link behind the flag; DST-safe quiet hours ([#223](https://github.com/sami-m-g/wovain/issues/223)) ([c944894](https://github.com/sami-m-g/wovain/commit/c94489477b43373f5de0cd9644cd37f2600a2433))
* **api:** a repeat of the same design decision succeeds ([#17](https://github.com/sami-m-g/wovain/issues/17)) ([300cbe1](https://github.com/sami-m-g/wovain/commit/300cbe1e807335dc6360d5be8717f937e56c5cb9))
* **autopilot:** scan now shows progress inline ([#148](https://github.com/sami-m-g/wovain/issues/148)) ([663a22f](https://github.com/sami-m-g/wovain/commit/663a22fbe6217f8786682fd523dc71b4e23a6013))
* **billing:** create the Free plan once under a lock; code-defined credit settlements ([#165](https://github.com/sami-m-g/wovain/issues/165)) ([8b84eb9](https://github.com/sami-m-g/wovain/commit/8b84eb98f9caa63ebc7c36fea32d1936b1741219))
* **billing:** give research credits back when it finds no ideas ([#235](https://github.com/sami-m-g/wovain/issues/235)) ([96bf1cb](https://github.com/sami-m-g/wovain/commit/96bf1cb34232ec04f10bc0289bd08c94884da36e)), closes [#232](https://github.com/sami-m-g/wovain/issues/232)
* **billing:** namespace polar metadata per environment ([#100](https://github.com/sami-m-g/wovain/issues/100)) ([79c5ece](https://github.com/sami-m-g/wovain/commit/79c5ece540638609939ea8cc780c91c6c4324165))
* **billing:** per-environment secret IDs for the polar seed ([#101](https://github.com/sami-m-g/wovain/issues/101)) ([918db6a](https://github.com/sami-m-g/wovain/commit/918db6a83e0c86cfc1f654f1c0ff7549c9e9e678))
* **billing:** settle a Polar customer left under a stale link; Free is 25 credits ([#130](https://github.com/sami-m-g/wovain/issues/130)) ([db4ea82](https://github.com/sami-m-g/wovain/commit/db4ea8284e2ec6cecb310cb63429e1a396ae881c))
* **design:** the judge looks at the drawn art, and a sent-back design is redrawn once ([#23](https://github.com/sami-m-g/wovain/issues/23)) ([3b521dd](https://github.com/sami-m-g/wovain/commit/3b521dd676f0c80321db93c11cfd5cdb0969dc81))
* **docker:** skip pnpm's dependency check after a cached install layer ([#137](https://github.com/sami-m-g/wovain/issues/137)) ([8c59334](https://github.com/sami-m-g/wovain/commit/8c59334bf6d1b794517690fd7ccf03ed973dc052))
* **evidence:** show a source's title and link, never scraped captions ([#254](https://github.com/sami-m-g/wovain/issues/254)) ([9bb12d2](https://github.com/sami-m-g/wovain/commit/9bb12d20588ff22bbaf1a547e95b4730ad21b610))
* **ideas:** name every idea before it shows, and say so while naming ([#257](https://github.com/sami-m-g/wovain/issues/257)) ([12b2dc6](https://github.com/sami-m-g/wovain/commit/12b2dc63b578dc679a2f360734bd6c50318a393a))
* **ideas:** the evidence gate never empties what to sell now or a typed brief ([#222](https://github.com/sami-m-g/wovain/issues/222)) ([217eb67](https://github.com/sami-m-g/wovain/commit/217eb670795f629f2cb7f9e7952c485cf2c4d434))
* **infra:** let infra-next reach next's Cloud Run service by project number ([#259](https://github.com/sami-m-g/wovain/issues/259)) ([6dde72d](https://github.com/sami-m-g/wovain/commit/6dde72dbd00709ba6135f30eb170aa1bdaea1f70))
* **infra:** let infra-next take the next stack's lock ([#144](https://github.com/sami-m-g/wovain/issues/144)) ([03360b7](https://github.com/sami-m-g/wovain/commit/03360b7bda25a40d861ba9851e94098d4f379bf3))
* **infra:** let the gitguardian key be undefined under exactOptionalPropertyTypes ([#92](https://github.com/sami-m-g/wovain/issues/92)) ([fa289cf](https://github.com/sami-m-g/wovain/commit/fa289cf058c43f09dfcba62e567fa52414a38bcd))
* **infra:** set the shared actions variables on the next environment ([#93](https://github.com/sami-m-g/wovain/issues/93)) ([f251e2d](https://github.com/sami-m-g/wovain/commit/f251e2d2ceeee6bd7a93bb9132657a5fd976ffe3))
* **infra:** show Pulumi's errors in CI and release the retired resources an up never released ([#125](https://github.com/sami-m-g/wovain/issues/125)) ([3993224](https://github.com/sami-m-g/wovain/commit/399322406bcff2f04744bfde64ebe74911972747))
* **onboarding:** per-path brand drafts, colours from plain words, top bar above the page ([#127](https://github.com/sami-m-g/wovain/issues/127)) ([730adb3](https://github.com/sami-m-g/wovain/commit/730adb35af3794058b2285a06810a2ce52ce2a5e))
* **onboarding:** write a brief when what to sell now is empty ([#237](https://github.com/sami-m-g/wovain/issues/237)) ([e93c41b](https://github.com/sami-m-g/wovain/commit/e93c41b9a996b90b0c2a43a81ce5d22514d3165b))
* **qloo:** search Qloo for short names from a brief; a 400 skips one term ([#186](https://github.com/sami-m-g/wovain/issues/186)) ([b1f023e](https://github.com/sami-m-g/wovain/commit/b1f023e2529f99e5a73a755ebe9bf884e1cdc06b)), closes [#185](https://github.com/sami-m-g/wovain/issues/185)
* **runs:** a provider out of credits fails the run at once ([#266](https://github.com/sami-m-g/wovain/issues/266)) ([ad6e7bd](https://github.com/sami-m-g/wovain/commit/ad6e7bd24dea38075cdde9b1eed3ad7e49602a85))
* **runs:** failed runs reach PostHog; a brief matches Qloo on tags as well as entities ([#239](https://github.com/sami-m-g/wovain/issues/239)) ([ebd99b7](https://github.com/sami-m-g/wovain/commit/ebd99b7d4895b254f8d66e4ed530076fea378024))
* **trends:** research every key concept of a typed brief and rank by coverage ([#253](https://github.com/sami-m-g/wovain/issues/253)) ([4afeee7](https://github.com/sami-m-g/wovain/commit/4afeee7207bf7d60ea779928d6a6fa01233f0b7e))
* **web:** onboarding copy no longer names fal ([#110](https://github.com/sami-m-g/wovain/issues/110)) ([5c7b0ed](https://github.com/sami-m-g/wovain/commit/5c7b0edf457cb87c74d5f1d0d2575ddb68be4c64))


### Performance Improvements

* **drops:** what to sell now opens at once and streams ([#174](https://github.com/sami-m-g/wovain/issues/174)) ([e317fa5](https://github.com/sami-m-g/wovain/commit/e317fa52300afb0e76014328cf7274b03e85653f))

## [0.31.0](https://github.com/sami-m-g/wovain/releases/tag/v0.31.0) (2026-10-27)

### Bug Fixes

* Quote checkout around unpriced upstream variants ([892ca5c](https://github.com/sami-m-g/wovain/commit/892ca5c69a371d63bd0784b506ca4c5f0b864185))

### Documentation

* Move development to GitHub (#4) ([42a1716](https://github.com/sami-m-g/wovain/commit/42a1716efbde1b533986c0dad2563cef54cfe788))

### Miscellaneous

* Repair a Cloud Run template whose image is missing before pulumi up ([98da87e](https://github.com/sami-m-g/wovain/commit/98da87e203d5611fa501624b065ff4b544814a71))
* The template repair keeps LATEST routing on a service that uses it ([1f1ceb4](https://github.com/sami-m-g/wovain/commit/1f1ceb4f409c3fc923cc8ae737dd48f376b1bba1))
* Remove GitLab DevSecOps automation (#6) ([b1ab5e4](https://github.com/sami-m-g/wovain/commit/b1ab5e4c18e3a034817fe6c1a1a23a1c981d7fd7))
* Add github actions ci, dependabot and a pr template (#5) ([dbead83](https://github.com/sami-m-g/wovain/commit/dbead83ac06ecd45736926315961bd63ea9a5cef))
* **infra:** Make GitHub the primary repository and drop GitLab (#8) ([ac8227c](https://github.com/sami-m-g/wovain/commit/ac8227c1435ed229fc073d9de7e3595ff9639356))
## [0.30.0](https://github.com/sami-m-g/wovain/releases/tag/v0.30.0) (2026-10-27)

### Bug Fixes

* **infra:** Mount the Meta app secrets now that they have versions ([3678a92](https://github.com/sami-m-g/wovain/commit/3678a921af29849d15618b7cbcd7ad90689a7769))
* **ops:** Warm the canary before probing it ([52fec36](https://github.com/sami-m-g/wovain/commit/52fec36d879446ba0649e7ed800a8ee96feaa08e))
* **ops:** Don't roll back a healthy canary over a few unanswered probes ([bdc385c](https://github.com/sami-m-g/wovain/commit/bdc385c213304df01ad3f48ab590607d35646740))
* **ops:** Give canary probes 30 s, past a cold instance's first answer ([484060d](https://github.com/sami-m-g/wovain/commit/484060d17e04cf276af027a7b48ffc1a422943bf))
* **mastra:** Create Mastra's storage schema at deploy time; run agents without memory when it fails ([0e67d5d](https://github.com/sami-m-g/wovain/commit/0e67d5d149c87b154ae8f50fa9f8b499d84a2bfb))
* **web:** Show a failed or empty run in the wizard, and say what a drop needs ([09e8f58](https://github.com/sami-m-g/wovain/commit/09e8f5869cb79a652634350eb78cb74747e5c334))
* **core:** A long coach line no longer fails the design judge ([456fa8e](https://github.com/sami-m-g/wovain/commit/456fa8ee71724338c29aa3d6009a31b82249e459))
* **core:** Find Qloo taste for merch seeds and show n/a when it has none ([276807b](https://github.com/sami-m-g/wovain/commit/276807bf98eea8e249014f19b3ab09e53432ab16))
* **api:** Approving a design no longer hangs forever ([6e28cbd](https://github.com/sami-m-g/wovain/commit/6e28cbda61c890861a55c26327d8120c628def58))
* **api:** Need a run engine only for a waiting run; undo only what the decision set ([ec5dbc3](https://github.com/sami-m-g/wovain/commit/ec5dbc36120414d2dc814195f230cf99b951ae21))
* **web:** Design card shows the art on a shirt, with no image pop-in ([adcab4c](https://github.com/sami-m-g/wovain/commit/adcab4ce7a35136e459e5719968d5a34396519c8))
* **core:** Research returns 3-5 distinct themes with relevant, recent sources ([cd2e6ed](https://github.com/sami-m-g/wovain/commit/cd2e6eddbb2d45ffca23b2c4dd1d9d488b19d03d))
* **core:** Pick a Fourthwall blank with retry, a default and a real error ([e343226](https://github.com/sami-m-g/wovain/commit/e3432269db01e324bc28ccdb79321e647e5303ff))
* **infra:** Raise web Cloud Run memory to 1Gi ([c724e6d](https://github.com/sami-m-g/wovain/commit/c724e6df6f42f23e3e84559f53a85b73fc1d75a8))
* **observability:** Export Mastra spans to GitLab Observability and Cloud Trace ([6905f2e](https://github.com/sami-m-g/wovain/commit/6905f2ed655ab9c1b9a87c3939bf0b4abee0cd6b))
* **api:** A run draws a design for each top idea, not only the first ([2af2a65](https://github.com/sami-m-g/wovain/commit/2af2a65940ef1ede82d91507de87630a792ce0f8))
* **web:** Pricing copy states the cost of a three-design drop ([b5629de](https://github.com/sami-m-g/wovain/commit/b5629dec1923cd9d1167fcb3c3985efc85c008d1))
* **connections:** Refresh expired fal grants, ask to reconnect, log run failures ([2c90da0](https://github.com/sami-m-g/wovain/commit/2c90da02b196aeab4abaea0683d1d3d2c3812c9d))
* **connections:** Only a real token refusal refreshes, and only a dead grant expires ([976b7dc](https://github.com/sami-m-g/wovain/commit/976b7dcb51fdd267af83c19dffd56e586d19541d))
* **core:** A refresh this session rotated isn't taken for another's ([ad6530d](https://github.com/sami-m-g/wovain/commit/ad6530db55895663c0f5e79b49de005a5e097766))
* **ops:** Write flow markers as visible Machine data lines ([9edfbf2](https://github.com/sami-m-g/wovain/commit/9edfbf23513df02f7d25f3567e5a3c46b70bae58))

### Code Refactoring

* **web:** Remove WOVAIN_ALLOWED_EMAILS and the internal visitor flag ([9f9d6bf](https://github.com/sami-m-g/wovain/commit/9f9d6bfb2391d4c9095fc3fb12f319e25c39fb1d))

### Documentation

* **submission:** Evidence pack and draft answers for GitLab Transcend ([b941842](https://github.com/sami-m-g/wovain/commit/b941842342ed639424defe386eb5950be4a3f4b6))
* **submissions:** Start the Transcend live-loop record ([3b6a6c7](https://github.com/sami-m-g/wovain/commit/3b6a6c71e258c48d90b37b097ec7128d5a2103a0))
* **submissions:** Note the second canary demo attempt ([4e64d93](https://github.com/sami-m-g/wovain/commit/4e64d93e18ca9127d0f24b9b5263c32d90862524))
* **submissions:** Note the third canary demo attempt ([bc745a3](https://github.com/sami-m-g/wovain/commit/bc745a3cd2cd2360c168fd69a5b228a72cf2b2cf))
* **submissions:** Note the fourth canary demo attempt ([3b6f425](https://github.com/sami-m-g/wovain/commit/3b6f4255b6239d15b0ca9ae34c4edcf3bf7eace5))
* **submissions:** Record each Duo flow running live for Transcend ([6dd2ec9](https://github.com/sami-m-g/wovain/commit/6dd2ec960114fa8681ff20490c5bcfa25c666f79))

### Features

* **infra:** Add Google Workspace mail DNS for wovain.com ([1c977b4](https://github.com/sami-m-g/wovain/commit/1c977b47361f7349e04a80d9378f47900cad4e52))
* **monitor:** Send telemetry to GitLab Observability and link incidents to traces ([4058f5a](https://github.com/sami-m-g/wovain/commit/4058f5a75bfe6903890a4a9541c9a1a5fbcc37ee))
* **infra:** 1 GiB web memory, a warm production instance and CPU boost ([c5049f2](https://github.com/sami-m-g/wovain/commit/c5049f263a33bfde8897f922b13988a430c980c9))

### Miscellaneous

* **infra:** Set the Google Workspace domain verification token ([dc0f6eb](https://github.com/sami-m-g/wovain/commit/dc0f6eb185483bc96df04b4a2276082202cfbaaf))
* **infra:** Set the Google Workspace DKIM key ([1f13470](https://github.com/sami-m-g/wovain/commit/1f134702e8049cbae39fe3b17cab0fd03299e177))
* Deploy the newest pipeline first, cancel and skip superseded ones ([7e273b9](https://github.com/sami-m-g/wovain/commit/7e273b9f713ce7b0d1e828522b68e43b4bf6ed84))
* Always verify the canary; guard deploy:development; keep posthog:apply uninterruptible ([67bb494](https://github.com/sami-m-g/wovain/commit/67bb494ffadf281dc8fbb1e2a3005c1815090ea4))
* Mirror GitHub even when a smoke check fails; accept Inngest's signed-route 401 ([a253f1b](https://github.com/sami-m-g/wovain/commit/a253f1baef9afcdd992a4b0f2a162aba098ad72d))
* Merge origin/main into fix/qloo-affinity ([4de5a62](https://github.com/sami-m-g/wovain/commit/4de5a62fdeb2076c1af0b4948991d68ad7f49882))
* **infra:** Stop mounting the retired wovain-allowed-emails secret ([8848e60](https://github.com/sami-m-g/wovain/commit/8848e60f1a30e67b161cc6bb998ce39b842815e3))
* Superseded check works in the gcloud image, which has no curl ([2fb9f12](https://github.com/sami-m-g/wovain/commit/2fb9f12c322c66039d7364343a263fc80f33d192))
* Build, apply and migrate in parallel; skip what didn't change ([6ba9aeb](https://github.com/sami-m-g/wovain/commit/6ba9aebc844f18667870c71ff7f059b4d7198e6c))
* Give buildx a docker context for dind's TLS settings ([ffe1902](https://github.com/sami-m-g/wovain/commit/ffe19024c4f2498dc6b5f3ac737cd4ebd0bb5137))
* Name the buildx builder apart from its context ([f62c57c](https://github.com/sami-m-g/wovain/commit/f62c57c495c7718de001958355e1b9f7a1d838fe))
* Merge origin/main into ci/faster-deploys; keep only startup CPU boost ([0536d5d](https://github.com/sami-m-g/wovain/commit/0536d5d97d905bf37cd519762ebab007e3b44bdb))
* Merge origin/main (newest-deploy-first) into ci/faster-deploys ([78fb72e](https://github.com/sami-m-g/wovain/commit/78fb72ec3cf26468dc9f6267aacdf207ab22aa82))
* A Canary-Demo-Fault trailer starts the canary demo from a merge request ([7007abe](https://github.com/sami-m-g/wovain/commit/7007abe9d3532e40fe3e8522c67048ff6e1cce44))
* Run catalog-sync without waiting on earlier stages ([717e382](https://github.com/sami-m-g/wovain/commit/717e38227033a4cb5f77595fc84d7af9299c86fa))
* Update AI Catalog mapping [skip ci] ([37bcf36](https://github.com/sami-m-g/wovain/commit/37bcf36df8deda97ee1001d004bf415f2265a85c))
* Read the Canary-Demo-Fault trailer through the API, not git ([610e6f6](https://github.com/sami-m-g/wovain/commit/610e6f61f13c7dd1e2271f79d75a4702dd00ff81))
* Run deploy checks with gcloud's bundled Python ([b9c9f3c](https://github.com/sami-m-g/wovain/commit/b9c9f3c9847ff0f8ed441b3a5af5885f5b4dbcd5))
* Give gcloud's bundled Python the CA certificates ([fe95598](https://github.com/sami-m-g/wovain/commit/fe955980dfb72d380ec99f7a4b9a5ce875aa4352))
## [0.29.0](https://github.com/sami-m-g/wovain/releases/tag/v0.29.0) (2026-10-26)

### Bug Fixes

* **core:** Make the live trends, art and judge chain work ([c229168](https://github.com/sami-m-g/wovain/commit/c229168fbc64c65bf1ed722747868df894a6da93))
* **web:** Generate next route types before type-checking ([39b0850](https://github.com/sami-m-g/wovain/commit/39b0850fe047007544882f69d31810363d8828fa))
* **duo:** Drop max_cycles, which the flow schema rejects ([7c0dcb9](https://github.com/sami-m-g/wovain/commit/7c0dcb9c8cd26698f3cfed1a3758f9253989182d))
* **ci:** Let the sci report fail without failing main ([8bac826](https://github.com/sami-m-g/wovain/commit/8bac82638481399605253e758fe216a658cd553c))
* **duo:** Describe the heal signature without an html comment ([3dfdc0d](https://github.com/sami-m-g/wovain/commit/3dfdc0d7d5681f3b1488c0520bb33755e33a6cea))
* **infra:** Unblock the first pulumi up ([8da8fe5](https://github.com/sami-m-g/wovain/commit/8da8fe505b7699c406e53c70208a1ea3eac0d2d1))
* **infra:** Make the status pages domain opt-in ([c7bdf6a](https://github.com/sami-m-g/wovain/commit/c7bdf6ac7e7e3ee48726a0381621719b29e2bf44))
* **web:** Build workspace deps in the image and check images on MRs ([af94efd](https://github.com/sami-m-g/wovain/commit/af94efdc641e140bf86f65f1ea9b09210706052a))
* **infra:** Adopt the development environment gitlab created ([e2ca142](https://github.com/sami-m-g/wovain/commit/e2ca142bf4e414b270893d6f6b5904cc4a7cee12))
* **ops:** Repair the scheduled ops pipeline and triage SAST findings ([614b1ef](https://github.com/sami-m-g/wovain/commit/614b1efe8b69f4c4051ea911456940268c9f2804))
* **web:** Setup checklist links keep their visible names ([e7985c1](https://github.com/sami-m-g/wovain/commit/e7985c130af7706e0b13c47393b4363e3753abae))
* **web:** One run tape, hairline rails, no eyebrows, checklist rows ([bf0c6ee](https://github.com/sami-m-g/wovain/commit/bf0c6ee286678dc2b8e8e5aaa2a2e31b32a2d65a))
* **web:** Llms.txt, 404 for unknown files, one ChatGPT setup, CTA analytics ([db766f3](https://github.com/sami-m-g/wovain/commit/db766f368f8683b155d6f549829ab6770e136424))
* **api:** Bound paid spend with an allowlist, daily quotas and a global cap ([b7b60cd](https://github.com/sami-m-g/wovain/commit/b7b60cd5693e261b0c4de383af2bdc1f70a774b5))
* **ci:** Mirror to github after deploy, without blocking it ([458be04](https://github.com/sami-m-g/wovain/commit/458be045c3b3e960a2385973b6ad6054f00644b1))
* **infra:** Roll out dev only after its secret access is granted ([91071e0](https://github.com/sami-m-g/wovain/commit/91071e06448351a961c76e592867b4742c38b696))
* **infra:** Write Resend's rsend CNAME so the domain fully verifies ([5eba147](https://github.com/sami-m-g/wovain/commit/5eba147cc58a857de1464a4bfe42ce90986cca92))
* **infra:** Run duo code review on every new merge request ([78eddcb](https://github.com/sami-m-g/wovain/commit/78eddcb4751f6e7eae8660e116bb3abde29d2372))
* **renovate:** Request review from the deps-review flow's real service account ([e023e98](https://github.com/sami-m-g/wovain/commit/e023e98f5f2f1761ea50ec6e9c262975f9179569))
* **web:** Serve status.wovain.com through Cloud Run and proxy GitLab Pages ([6470e8c](https://github.com/sami-m-g/wovain/commit/6470e8c606419ba1973891e52b8f48fd8761b6e2))
* **infra:** Enable custom duo flows in code, heal included ([6c1582f](https://github.com/sami-m-g/wovain/commit/6c1582fa25c8a49bf1227be754b6f9f26bdeb18a))
* **web:** List only merchant connections and hide vendor internals ([75556a4](https://github.com/sami-m-g/wovain/commit/75556a4d4e95b9488d0593ff0a9c1ead568b00f7))
* **infra:** Pin the AI Catalog consumer to a version prefix ([255d61b](https://github.com/sami-m-g/wovain/commit/255d61b5ef6e0bceaf2092ebfb45cf6c4751accf))
* **infra:** Pin AI Catalog consumers with pinnedVersion ([0f16ecc](https://github.com/sami-m-g/wovain/commit/0f16ecc49a251ff165c5859dd32b06f0b67bb5fb))
* **infra:** Fail on a synced Duo item without a catalog version ([902110f](https://github.com/sami-m-g/wovain/commit/902110f0d1a05582696c773ca5b9b3d6c03947b7))
* **brand:** Pin the reduced-motion mark to rest after hydration ([ff0d685](https://github.com/sami-m-g/wovain/commit/ff0d68507fdcf69796f9e644bc62c0d1532fabae))
* **infra:** Pin the version when adopting an enabled Duo flow ([e0f3a8d](https://github.com/sami-m-g/wovain/commit/e0f3a8de1eee9116b52e1f13c66facfa1a8e5791))
* **web:** Read Google sign-in config at request time ([d0b8abf](https://github.com/sami-m-g/wovain/commit/d0b8abf1a92208a4a56797dbc71a66fcbff328b7))
* **ui:** Resolve shadcn ui alias to src so the CLI writes vendored files in place ([495c52b](https://github.com/sami-m-g/wovain/commit/495c52ba172996aefa310aebb31ef6ab787501f7))
* **web:** Restore analytics identity and Google callbacks under Better Auth UI ([317bb88](https://github.com/sami-m-g/wovain/commit/317bb8890c69646bd72ec2703a9228c3965a394a))
* **web:** Title each auth view and test the auth client plugin ([ccce068](https://github.com/sami-m-g/wovain/commit/ccce0685f153550527beea5fe5291d20cf156eea))
* **infra:** Never update an enabled Duo flow consumer ([95f3110](https://github.com/sami-m-g/wovain/commit/95f311048d8974302c6b2c2bd5815bfb722077a1))
* **ops:** Clear GitLab Duo's change request by re-requesting its review ([d0566c0](https://github.com/sami-m-g/wovain/commit/d0566c0c483f720dc10e68fa89ff37cc69818b8c))
* **web:** Stop varlock leak detection failing sign-in on WOVAIN_ALLOWED_EMAILS ([03dcd43](https://github.com/sami-m-g/wovain/commit/03dcd43f5192553114709c8d5719c726607db5dc))
* **analytics:** Send server events before the response and add run KPIs ([b2d1cca](https://github.com/sami-m-g/wovain/commit/b2d1cca73451268cfa067a6109fe5212dec93fd8))
* **web:** Keep Mastra and Inngest external to the server bundle ([0e84f5f](https://github.com/sami-m-g/wovain/commit/0e84f5fe707bf296bae788b19ce2e9f40577342d))
* **infra:** Keep the DNS zone known in previews ([5bf3562](https://github.com/sami-m-g/wovain/commit/5bf3562b358983874814745e70540077d19dfbc1))
* **web:** Match header control heights to the shared default size ([14041ac](https://github.com/sami-m-g/wovain/commit/14041ac103055978d377825e4fa0b3f330bda47a))
* **delivery:** Address Duo review of the canary and release guard ([fd44cc9](https://github.com/sami-m-g/wovain/commit/fd44cc93c2dc67684cff7ca97a57f1af21cfb845))
* **delivery:** Blame the newer change and leave the canary's deploy alone ([ca1a938](https://github.com/sami-m-g/wovain/commit/ca1a9384702638a62fdd5a805b3eed1854821205))
* **ops:** Measure the canary's grace from when the deploy finished ([128a3ed](https://github.com/sami-m-g/wovain/commit/128a3ed5ffb5e6ab97bb92eb617ec9150770dafb))
* **delivery:** Fail closed without GitLab in production; measure production alone ([6013185](https://github.com/sami-m-g/wovain/commit/6013185f7847b497a4e302c99f7d8f0069941c2d))
* **infra:** Read wovain:internalUserIds as a list or comma separated ([3e3016b](https://github.com/sami-m-g/wovain/commit/3e3016bc3c401c303aae149b29b49592075fdc97))
* **infra:** Give percent rollouts a groupId GitLab accepts ([50f696e](https://github.com/sami-m-g/wovain/commit/50f696e688ac9a523cee5b4a94de581d12855c36))
* **billing:** Claim a promo attempt atomically before calling Polar ([ddac603](https://github.com/sami-m-g/wovain/commit/ddac603831e42b8c74f1a3b9aca6fd01cbe48aea))
* **auth:** Trace and capture auth email failures, verify email via Google link ([221967b](https://github.com/sami-m-g/wovain/commit/221967b9fc651dcb00a94e864a0dfdebdb327915))
* **auth:** Never fail the sign-up when capturing a failed email fails ([92a38b7](https://github.com/sami-m-g/wovain/commit/92a38b71fc4ea968f9746bca02376d721661b41b))
* **ci:** Run the Pulumi jobs only when the Pulumi program changes ([b404f53](https://github.com/sami-m-g/wovain/commit/b404f53477bc8a9ee1ad91ed377bf4713ea01845))
* **web:** Redirect to the public origin; mount Meta app secrets ([6cb49bc](https://github.com/sami-m-g/wovain/commit/6cb49bc27cd7376e2a12a9b4fbf62c31999c038c))
* **ops:** Keep submission-tag requests inside the GitLab API base ([1bdd9df](https://github.com/sami-m-g/wovain/commit/1bdd9dfa60e39d6d7b01f783a07129c216aae921))
* **web:** Import createError from evlog in the connection callback ([ba49e13](https://github.com/sami-m-g/wovain/commit/ba49e13bdb3305883891f513b60d1e27fc4e5fdb))
* **infra:** Mount only secrets that have a version ([eb1d07a](https://github.com/sami-m-g/wovain/commit/eb1d07ae4ddfa4412fe8f6cc7ac35bd25794831d))
* **web:** Add og:image to every page, drop the model name from user copy ([1b776eb](https://github.com/sami-m-g/wovain/commit/1b776ebb784200917b3bdfad17041874be5109b2))
* **billing:** Give the Free plan a 0 fixed price in the Polar seed ([d37f249](https://github.com/sami-m-g/wovain/commit/d37f2491111bd957df9eb6bc2a511d6e95425be5))

### Code Refactoring

* Remove the optimizer and vendored ads skills for now ([c20e50b](https://github.com/sami-m-g/wovain/commit/c20e50bcecdcf3d6cbde8bf94e71dd57bdd88e8a))
* **web:** Use oRPC query utils, TanStack Form, Base UI Field and shared helpers ([9a8d3e2](https://github.com/sami-m-g/wovain/commit/9a8d3e2ba798d5fae6ac8811a80c0bc81168c498))
* **packages:** Share lib tsconfig, Drizzle relations, evlog defineError, locale negotiation ([8e63d7e](https://github.com/sami-m-g/wovain/commit/8e63d7e0ffeabb3a3c59bd85e1096004ccec9ed4))
* **ops:** Use Varlock, gitbeaker, Google Cloud clients and the Vitest API ([636660a](https://github.com/sami-m-g/wovain/commit/636660a24c3f9aefac20901592d999a98cd40c27))
* **infra:** Dedupe Cloud Run, secret and CI config; read DATABASE_URL via GitLab secrets ([ac58589](https://github.com/sami-m-g/wovain/commit/ac585898d9b1f4924554c1a13504438793536ae1))
* Format infra/index.ts ([133d530](https://github.com/sami-m-g/wovain/commit/133d53098b3571b501bc595a96d806ec3d681a72))

### Documentation

* Add Fumadocs content tree, rewrite README and restore MIT license ([d7a9dc5](https://github.com/sami-m-g/wovain/commit/d7a9dc5cb7829d16acb8d3a01f18988a0becd57c))
* Add Build With AI Basics scope, PRD, spec and app map, synced to the docs site ([62f06e7](https://github.com/sami-m-g/wovain/commit/62f06e7d836cb7c7591018f28e70ba2c7b1c5d2a))
* Align docs and app map with the real backend, document the ChatGPT connector ([4a50c8e](https://github.com/sami-m-g/wovain/commit/4a50c8e218f6c91077fc82e71cf420e36c0666f5))
* Add Build With AI Basics submission pack ([034c636](https://github.com/sami-m-g/wovain/commit/034c636c130c0353e36c13957f42126095196145))
* Refresh scope, PRD and spec to the 2026-10-26 decisions ([f97bf69](https://github.com/sami-m-g/wovain/commit/f97bf695ed3223da2451360480bf3d7a89646d14))
* **fumadocs:** Sync product scope, PRD and spec in en, fr and es ([10b5784](https://github.com/sami-m-g/wovain/commit/10b5784da0ceca4516234d1c39da94c4feffb30f))
* Rewrite the docs as product docs with a separate Developers tab ([c609757](https://github.com/sami-m-g/wovain/commit/c6097571a495d88156abd1149038410b6325e97b))
* Propose wovain pricing (credits, Free/Studio/Label, pack) ([3b6e93c](https://github.com/sami-m-g/wovain/commit/3b6e93ce02634f0b18be0c1713246eca1c1085e4))
* **submissions:** Judge testing instructions and pre-flight checklist ([9130b34](https://github.com/sami-m-g/wovain/commit/9130b34276559b6ad8619aab95ec80ca30dbaa54))
* **submission:** Refresh Basics pack for the designer product ([3c9686e](https://github.com/sami-m-g/wovain/commit/3c9686e6cb292bf8531825b5fe3412c1e3e0288b))
* **submission:** Keep the video outline under the 3:00 limit ([06156f5](https://github.com/sami-m-g/wovain/commit/06156f5e80898931334c0fed3f67eaf182f66695))
* **adr:** Record durable runs on Mastra workflows with Inngest ([af72f95](https://github.com/sami-m-g/wovain/commit/af72f95029b4211e204dbae531727455e197f122))
* **adr:** Progressive delivery with GitLab flags, Cloud Run canaries and a release guard ([b61e2ce](https://github.com/sami-m-g/wovain/commit/b61e2ce872a8f915574ce9193f8fb0d89d4d1a87))
* Progressive delivery in flows.md, AGENTS.md roll out and roll back, openspec change ([09b643d](https://github.com/sami-m-g/wovain/commit/09b643d194e6c1b053f56970249beac14c7f0575))
* **delivery:** Describe the production fallback without GitLab ([c0b607d](https://github.com/sami-m-g/wovain/commit/c0b607dd26ab2354144bb86fac72cde491f86fb3))

### Features

* **docs:** Add en, fr and es i18n to the Fumadocs site ([6f409db](https://github.com/sami-m-g/wovain/commit/6f409db61be1ae220750e289087a1846c1978887))
* **infra:** Deploy web to cloud run with cloud sql and lean gitlab ci ([9c25b27](https://github.com/sami-m-g/wovain/commit/9c25b270b35a04130489b34aed505d212e6d747d))
* **core:** Add the seller-flow domain package ([336b6b4](https://github.com/sami-m-g/wovain/commit/336b6b4fd8af2090c39be73bbe1ab190a049dccf))
* **db:** Add seller-flow tables and OAuth provider schema ([b804034](https://github.com/sami-m-g/wovain/commit/b804034e6f4a5d252f2e6bf384d3359a3c06f481))
* **api:** Add seller-flow procedures and MCP tools ([c8eee0f](https://github.com/sami-m-g/wovain/commit/c8eee0fbe9d54336a6036a718c0304afab3312d9))
* **web:** Serve MCP to ChatGPT with Better Auth's OAuth provider ([5926553](https://github.com/sami-m-g/wovain/commit/592655313f887af2bcb03f0794ec33a93249cf92))
* **ops:** Duo flows for self-healing, kpi scout, issue to completion and vuln fixes ([0ae90ce](https://github.com/sami-m-g/wovain/commit/0ae90ce595552b143b28cc7b3e5743edbab8716b))
* **infra:** Serve wovain.com, docs and mcp hosts with dns, mail and scanning ([c62daff](https://github.com/sami-m-g/wovain/commit/c62daff3cc08547325b858678309778cbe90e63c))
* **widgets:** Add ChatGPT widgets for trends, designs, products and campaigns ([df861c1](https://github.com/sami-m-g/wovain/commit/df861c134c70fca7bee234eca6c4669278a04c63))
* **email:** Send verification, password reset and run emails ([c5eacbd](https://github.com/sami-m-g/wovain/commit/c5eacbde377f1862db68267267e529fae4aad437))
* **ui:** Add alert, badge, checkbox, switch and textarea from shadcn ([09ef83f](https://github.com/sami-m-g/wovain/commit/09ef83fb9d48156c35b4f6f420877c47fba4e77d))
* **web:** Brand, localized landing, app shell and seller flow ([b9cc157](https://github.com/sami-m-g/wovain/commit/b9cc157149c25504dde2ae275e7f87e78832c180))
* **web:** Password reset, run links and sign-up locale ([3aa97fc](https://github.com/sami-m-g/wovain/commit/3aa97fcea16f9f4328a0af4ddf32c4e50941d38b))
* **infra:** Plan in the merge request, policy-gated apply, bootstrap split, dev env ([e995928](https://github.com/sami-m-g/wovain/commit/e9959286781ccaacd3b0a55ba7700ae27bfab5e8))
* **web:** Add cookieless PostHog analytics and feed it to the scout ([c495c64](https://github.com/sami-m-g/wovain/commit/c495c641ef782e99c768b752592f7b30853d2953))
* **ops:** Close the loop with PostHog sensing and verifying Duo's work ([e2694e9](https://github.com/sami-m-g/wovain/commit/e2694e906133cc6a62084d9aee42ff9118d46b58))
* **ops:** Auto-resolve findings no longer detected on the default branch ([ba3a42e](https://github.com/sami-m-g/wovain/commit/ba3a42e2c44a1b216a946a8b193da93aed7a1fd4))
* **infra:** Mirror GitLab main and tags to GitHub over a deploy key ([98ebe0d](https://github.com/sami-m-g/wovain/commit/98ebe0d8fd64692af2ed0200c60a5e25b5ad27c9))
* **web:** Label-and-tag product world, approved brand, SEO pages ([32a42a8](https://github.com/sami-m-g/wovain/commit/32a42a843d96573e34b1721ca68d75554fe3486b))
* **infra:** Register wovain.com with resend ([ea9d6c7](https://github.com/sami-m-g/wovain/commit/ea9d6c7a903c8f2c748ae90d5e5183a331f8206e))
* **auth:** Continue with Google ([507bcf6](https://github.com/sami-m-g/wovain/commit/507bcf68f22f0732a65f4a75c284729a11dfe909))
* **web:** Serve favicon.ico and raster app icons ([00c0a6b](https://github.com/sami-m-g/wovain/commit/00c0a6be2d536bd236f89594e1296c23b7d329c6))
* **auth:** Send sign_up from the server and identify on every load ([a9d92fc](https://github.com/sami-m-g/wovain/commit/a9d92fcdaa3ff1953355b2463b98a1d30eaa6099))
* **web:** Ask for analytics consent and record session replays ([fdfde6b](https://github.com/sami-m-g/wovain/commit/fdfde6b9e10955a919ccd00f3db9a0c066fe96c8))
* **web:** Identify the merchant again after a consent answer ([e1e1f86](https://github.com/sami-m-g/wovain/commit/e1e1f86de279d1afa0ed0964632074575d1ac8b2))
* **analytics:** Show visitor country and filter out bots and the team ([be77581](https://github.com/sami-m-g/wovain/commit/be775819026d2e9c312d16d37075beb2892a85c8))
* **web:** Ask US visitors for analytics consent too ([552c3e8](https://github.com/sami-m-g/wovain/commit/552c3e8c9429356325f5ca0f01e78342a1be8d99))
* **web:** Report server errors to PostHog Error Tracking ([d376ac3](https://github.com/sami-m-g/wovain/commit/d376ac3e88548c39dc14bc6beaf9a6787bf9c543))
* **web:** Rebuild the landing page for independent labels ([e8b4d4c](https://github.com/sami-m-g/wovain/commit/e8b4d4c43fe8a46d8a5f41391070d862287b5295))
* **web:** Retarget SEO pages to independent labels; gate timeline motion ([21ea353](https://github.com/sami-m-g/wovain/commit/21ea3534f9e43cd06f86441dfeeaa960d8eb961a))
* **web:** Rebuild the signed-in app on shadcn components ([9fb6d31](https://github.com/sami-m-g/wovain/commit/9fb6d310f7c24906b0e3714d3e26c4f866f5bf76))
* **insights:** Add a KPI dashboard for shop, ads and drop quality ([e47008d](https://github.com/sami-m-g/wovain/commit/e47008d477730cbe9caf4d71eb3acb48b657fbbf))
* **billing:** Add Polar catalog, atomic credit ledger and webhook mirror ([1f419e7](https://github.com/sami-m-g/wovain/commit/1f419e7840ff75358ec5e16b15fe475f2a03cca7))
* **api:** Charge paid steps in credits and wire Polar through Better Auth ([b8a25b5](https://github.com/sami-m-g/wovain/commit/b8a25b51c297bc20d2bbb83700c1c589263d00df))
* **web:** Add pricing page, billing page and upgrade screens ([e047343](https://github.com/sami-m-g/wovain/commit/e047343148da6459e61618607e0b35775087490c))
* **infra:** Wire Polar secrets and a manual polar:seed job ([a363f73](https://github.com/sami-m-g/wovain/commit/a363f73044c1875f5fc7614fcad47744404756e3))
* **billing:** Launch Free only behind the billing-paid-plans flag ([9afc4fa](https://github.com/sami-m-g/wovain/commit/9afc4fa35b1329238ded36cbe75aeb8cc6165129))
* **web:** Show paid plans as coming soon while only Free is live ([fcece13](https://github.com/sami-m-g/wovain/commit/fcece1377108d550a6d2ea5e04b339b6409e2988))
* **billing:** Store the webhook secret from code and start Free on first use ([212e62c](https://github.com/sami-m-g/wovain/commit/212e62c1c39d07d0b12f4b45f393a1849f1a7e92))
* **brand:** Ship the Shuttle logo through <Logo/> ([5eceb9f](https://github.com/sami-m-g/wovain/commit/5eceb9f56960afb49acc14ec1ad972ec6c185a61))
* **web:** Adopt Better Auth UI for sign-in, sign-up, reset and account settings ([3ff3e3c](https://github.com/sami-m-g/wovain/commit/3ff3e3ce6cb98f105ba0245f722aba87e12df44b))
* **web:** Lead the landing page with an animated product demo ([d0608b8](https://github.com/sami-m-g/wovain/commit/d0608b8a7f26c3a362e88e063cb91af1ff7a3113))
* **db:** Add external write ledger and idempotency keys for durable runs ([7a86d83](https://github.com/sami-m-g/wovain/commit/7a86d83af56dfcf11c05aeb78b6599ab552fe01c))
* **api:** Run the seller flow as a durable Mastra workflow on Inngest ([a0da10d](https://github.com/sami-m-g/wovain/commit/a0da10d682927891fdac654d1b44fc547455e1ea))
* **core:** Call Nemotron through a Mastra agent on the AI SDK ([2f2f245](https://github.com/sami-m-g/wovain/commit/2f2f2455a597d7d0a2767168961bb6412eb9187b))
* **connections:** Draw designs with the merchant's own fal key ([9af3e6c](https://github.com/sami-m-g/wovain/commit/9af3e6c129271c33e4eccd0cf672abad1e2257d0))
* **connections:** Connect fal over its MCP relay with OAuth ([acee0a4](https://github.com/sami-m-g/wovain/commit/acee0a4ca19c18ebd9b666d9457cddfe56bf94e4))
* **api:** Route runs to the Mastra workflow behind the mastra-runs flag ([f1c6381](https://github.com/sami-m-g/wovain/commit/f1c63810a0ef2105a0c610357d69542f1d160780))
* **agents:** Score, guard, remember and trace every Mastra agent and step ([bbe9383](https://github.com/sami-m-g/wovain/commit/bbe9383941b0e7f467d8eefecdfe4de85f8fec0e))
* **infra:** Flags as code with per-environment strategies, an internal-only list and owners ([e0eadb4](https://github.com/sami-m-g/wovain/commit/e0eadb48d2fefaec008fd29aaff0caad0afb8ebf))
* **flags:** Official Unleash SDK with plan context, PostHog exposures and fail-closed defaults ([53a9839](https://github.com/sami-m-g/wovain/commit/53a9839fee12d6ae754c7b302e19b34ae4c209b2))
* **delivery:** Canary every web deploy on a tagged Cloud Run revision, promote or roll back in CI ([813d977](https://github.com/sami-m-g/wovain/commit/813d977200934057eb6c4932deb251a2e36ca00b))
* **ops:** Release guard kills the changed flag or rolls back; flag hygiene files cleanup issues ([0b77617](https://github.com/sami-m-g/wovain/commit/0b776170cb58a79701a5d3c51f4b8ad4f1a5ecfb))
* **duo:** Wovain release-guard flow diagnoses rollbacks and kill switches ([d79f16e](https://github.com/sami-m-g/wovain/commit/d79f16ec7f638eff78b7871947b7d3d0b68e3308))
* **ops:** The release guard and heal watch dev.wovain.com; the fault flag serves development only ([a7c4095](https://github.com/sami-m-g/wovain/commit/a7c409536782f1664f2ffc43fc8a1184584f081a))
* **docs:** Run the docs chat on Nemotron Nano via Nebius, with spend limits ([707e68a](https://github.com/sami-m-g/wovain/commit/707e68a8ecf15a7ecf802d87a27d18debe8af22f))
* **billing:** Promo codes for credits through Polar discounts ([45e01f0](https://github.com/sami-m-g/wovain/commit/45e01f08dd7bafe17d4a027cfac8c27b1d627623))
* **auth:** Confirm the email before an email sign-up enters the app ([814840d](https://github.com/sami-m-g/wovain/commit/814840d2f4a28bb735e3b1542559d6a17b132c7d))
* **heal:** Make PostHog Error Tracking the one error sink ([2cee05c](https://github.com/sami-m-g/wovain/commit/2cee05c958b05a2c788954550a50b6bfcdf03275))
* **web:** Show the hero demo inside the real dashboard chrome ([69692d5](https://github.com/sami-m-g/wovain/commit/69692d534e02f9f01d36df0a537341793fc15156))
* **web:** Show the Fern Study tee on a model in the ad preview ([191f48a](https://github.com/sami-m-g/wovain/commit/191f48ab4f93894e32870a403941d976ac992502))
* **web:** Show real Fourthwall mockups in the hero demo ([009e0f2](https://github.com/sami-m-g/wovain/commit/009e0f230e2041cdc66a158404aa4b3b4c035c5f))
* **web:** Add Docs link to the app sidebar ([fbb39c9](https://github.com/sami-m-g/wovain/commit/fbb39c9da6018f5e13646c2a0276b9babe1b276a))

### Miscellaneous

* Rebuild monorepo on Next.js 16, oRPC, Better Auth and Drizzle ([ede2c03](https://github.com/sami-m-g/wovain/commit/ede2c035fad6ccd34b8d617ca9207c7e15dc2fc1))
* **infra:** Set qloo and resend api key secrets ([1e66be7](https://github.com/sami-m-g/wovain/commit/1e66be7b9ce02b2cea7059b38385493b765a6b7c))
* **infra:** Set the gitlab feature flags instance id ([43dd89e](https://github.com/sami-m-g/wovain/commit/43dd89ecaa76d9d2e2fc9e799c6d5da9023e6013))
* **skills:** Add impeccable and ui-ux-pro-max design skills ([e213f81](https://github.com/sami-m-g/wovain/commit/e213f81bf1f5ac05ce32d31849d8cbaad01c7afe))
* Replace main with the rebuild architecture ([81a61a1](https://github.com/sami-m-g/wovain/commit/81a61a1cbda727674dc2890f67b2becb726b48d9))
* Update AI Catalog mapping [skip ci] ([8d25df8](https://github.com/sami-m-g/wovain/commit/8d25df8e3f901cf892bc4344b16ee3fe7ea298de))
* Leave the ai catalog mapping that ci writes unformatted ([cfacf19](https://github.com/sami-m-g/wovain/commit/cfacf19e2339996ca390dcffb952a3ad61eb3968))
* **infra:** Add the bootstrap stack config ([a17ee11](https://github.com/sami-m-g/wovain/commit/a17ee1108229a2dfdd35be24dcf839694e6885d8))
* **infra:** Adopt the preview CI variables the bootstrap set ([9ada9be](https://github.com/sami-m-g/wovain/commit/9ada9be62c30ce0cca1523a3587357ab333ba653))
* Update AI Catalog mapping [skip ci] ([ee954e3](https://github.com/sami-m-g/wovain/commit/ee954e3848fe6210aa1d415d8f0dad2e1ab57ab7))
* **infra:** Add the posthog ci key and project id ([1d11caa](https://github.com/sami-m-g/wovain/commit/1d11caadf660e4f02d79bca98b3c0dee10162dd4))
* Enable the posthog plugin for the project ([4f63938](https://github.com/sami-m-g/wovain/commit/4f63938d4ab833370bcd92451a033c32fcbec05d))
* **infra:** Add the google oauth client config ([0983b4e](https://github.com/sami-m-g/wovain/commit/0983b4eb01c08b8cf3387a7bb537de8e30b6d06c))
* **claude:** Enable the claude-security plugin ([b81bae9](https://github.com/sami-m-g/wovain/commit/b81bae9bb396dab31ec5069871a581c6bf2aed13))
* Adopt OpenSpec with capability specs and open changes ([0004206](https://github.com/sami-m-g/wovain/commit/0004206258181cf971107d5b861de16bee9dd14d))
* **agents:** Install industry skills, plugins and component registries ([a04b775](https://github.com/sami-m-g/wovain/commit/a04b775b44ef713e32f366ca7d6a8b278ea4a34a))
* **deps:** Automerge patches, group updates and add the deps-review Duo flow ([b924ade](https://github.com/sami-m-g/wovain/commit/b924adebec5aa4aa20e4fd13d613b01d5cd3ea17))
* **posthog:** Manage the product dashboards and alerts as code ([2709241](https://github.com/sami-m-g/wovain/commit/2709241d15d7d2798f555bc08a62810061ccecc8))
* Update AI Catalog mapping [skip ci] ([dfa0817](https://github.com/sami-m-g/wovain/commit/dfa08178de6d66b3ad76ec14823ea98e760cd7aa))
* **infra:** Add the Inngest keys to the prod stack config ([f6ca96f](https://github.com/sami-m-g/wovain/commit/f6ca96fa552738b86e0737a4bff82f7e1bdbcc5b))
* **ops:** Tag each hackathon submission at its deadline ([eab2871](https://github.com/sami-m-g/wovain/commit/eab2871c2919e5a5a79cc3aae8110dd17f5c8e1a))
* **ops:** Add the Devpost URLs for the remaining submissions ([1f2878b](https://github.com/sami-m-g/wovain/commit/1f2878b67b8e4b595b25694ef6926f532bb3f142))
* Update AI Catalog mapping [skip ci] ([13913b8](https://github.com/sami-m-g/wovain/commit/13913b8d42681d2194b05f3799cca71ac7d2aee7))
* **mcp:** Add the fal MCP server at project scope ([db1c1a4](https://github.com/sami-m-g/wovain/commit/db1c1a478f5afc9f8c3906e99df0843499fe9a4c))
* **mcp:** Add the Fourthwall MCP server at project scope ([2b95b51](https://github.com/sami-m-g/wovain/commit/2b95b518f624d6d51e35d2a05dd9acd2ce5fec78))
* **web:** Remove the developer API status indicator from the sidebar ([8b25443](https://github.com/sami-m-g/wovain/commit/8b2544311c544e441723f172cfd7855ccb691c5b))
* **infra:** Set the GitLab Observability OTLP endpoint ([9e16438](https://github.com/sami-m-g/wovain/commit/9e16438abc781e938e18cdcccc3fc7bc9058a854))
* **web:** Drop the unused second model shot ([8fe59c6](https://github.com/sami-m-g/wovain/commit/8fe59c65b4bcef534549a0d5e3578a051b4b18f9))

### Tests

* **billing:** Migrate one PGlite per test file and truncate between tests ([f055222](https://github.com/sami-m-g/wovain/commit/f055222ea57bce6e0ba09b3e8b3159be0fda50ca))
* **ops:** Give the 20-page cap test room on shared CI runners ([e985484](https://github.com/sami-m-g/wovain/commit/e985484d142402c98ce7fd947a72a12806a5ded9))
* **billing:** Allow PGlite's one-time migration time on busy CI runners ([07394c0](https://github.com/sami-m-g/wovain/commit/07394c02fdcb27ef909adf2eb8dd4bdc23057ee1))
* **api:** Cover durable run steps, guarded decisions and crash retries ([d57931c](https://github.com/sami-m-g/wovain/commit/d57931c9a84de7f2fcbfba4d4e33e2f7b364decc))
* **api:** Give the PGlite flow tests 30 s on CI runners ([9a48cb1](https://github.com/sami-m-g/wovain/commit/9a48cb17d342d12e561d66f41b8e3b27d0928650))
* **web:** Og:image is set per locale; use localizedUrl for it ([5052a8d](https://github.com/sami-m-g/wovain/commit/5052a8dc10125102286de6d667c544bb5cd3c90a))
## [0.28.0](https://github.com/sami-m-g/wovain/releases/tag/v0.28.0) (2026-10-23)

### Bug Fixes

* **ops:** Give duo a locked copy of each accepted issue ([1e4b169](https://github.com/sami-m-g/wovain/commit/1e4b1697d9e067eb81b3a3f764dd44950bdb6618))
* **ops:** Trust duo by user id and check the accepted original ([9cc643e](https://github.com/sami-m-g/wovain/commit/9cc643e5e4718e49e2cce2a3f3939371a738aef3))

### Features

* **ops:** Hand accepted issues to duo's developer flow ([3c09509](https://github.com/sami-m-g/wovain/commit/3c09509f3bb72716be6be1d334016d2092a7f356))
## [0.27.0](https://github.com/sami-m-g/wovain/releases/tag/v0.27.0) (2026-10-23)

### Bug Fixes

* **connections:** Stop sending the agent to fourthwall tools that don't exist ([038428c](https://github.com/sami-m-g/wovain/commit/038428c8e8ad25c43329fcfcac8aa9b0c70b47ea))

### Features

* **optimizer:** Observe fourthwall and meta and triage with code ([2eaac35](https://github.com/sami-m-g/wovain/commit/2eaac35cf68318980894d29fed8ec0082aee351e))
## [0.26.0](https://github.com/sami-m-g/wovain/releases/tag/v0.26.0) (2026-10-23)

### Bug Fixes

* **infra:** Let the ci account manage the optimizer queue's iam ([da2b764](https://github.com/sami-m-g/wovain/commit/da2b7644ebc781458098b3cfa4cd286db1aeb6b0))

### Features

* **optimizer:** Take signed webhooks into debounced cloud tasks ([376c790](https://github.com/sami-m-g/wovain/commit/376c7909f5b3242a4e1b4bf6daa5ec689f570305))

### Miscellaneous

* **infra:** Generate the optimizer's customer key and meta verify token ([0a36e24](https://github.com/sami-m-g/wovain/commit/0a36e245a3ccb61774e553f95cb91ff00cb35324))
* Add a 200px icon for chatgpt's connector ([b57612c](https://github.com/sami-m-g/wovain/commit/b57612cce789945a276bf7698d0103ba7f752302))
## [0.25.1](https://github.com/sami-m-g/wovain/releases/tag/v0.25.1) (2026-10-23)

### Bug Fixes

* **optimizer:** Make the optimizer's guards fail closed ([b68f4e6](https://github.com/sami-m-g/wovain/commit/b68f4e672ebc69673005ac6a8a3377672457a964))
## [0.25.0](https://github.com/sami-m-g/wovain/releases/tag/v0.25.0) (2026-10-22)

### Bug Fixes

* **dashboard:** Count meta orders before the cap and skip caching unconnected states ([171d28b](https://github.com/sami-m-g/wovain/commit/171d28b41acddc13b301b1a8cacb3c54b557afbd))

### Code Refactoring

* **server:** Merge the two env loaders into one schema ([4fda589](https://github.com/sami-m-g/wovain/commit/4fda589811403d0e68fc5c0d718ebe30317d7700))
* **server:** Read image headers with sharp ([d225782](https://github.com/sami-m-g/wovain/commit/d2257821bd5f45526a4d0fb80add3c23c74664d5))
* **dashboard:** Move cost per sale to the server and reuse shared helpers ([1a06fb4](https://github.com/sami-m-g/wovain/commit/1a06fb4b012ce25e3e3ca5ece5e7b4dca4f2daa4))
* **shared:** Declare breakeven, quote, rule and record shapes once ([7c2b80f](https://github.com/sami-m-g/wovain/commit/7c2b80ffe6ff7d497b4cbf86933ff79c9bdf1060))

### Documentation

* **server:** Add intent, spec and plan for #15 ([981ec93](https://github.com/sami-m-g/wovain/commit/981ec939c9415765e2f4054229ea9d6a41348bf1))
* **server:** Add intent, spec and plan for #17 ([497a350](https://github.com/sami-m-g/wovain/commit/497a3504556ecb167de8e031e05491717803e8e6))
* **dashboard:** Add intent, spec and plan for #31 ([ed14dc5](https://github.com/sami-m-g/wovain/commit/ed14dc5708c6924765b463ec78cfac046c4bfb40))
* **shared:** Add intent, spec and plan for #16 ([69ae2ab](https://github.com/sami-m-g/wovain/commit/69ae2ab8841836898ede10fdd0212a9fd7994cdb))

### Features

* **dashboard:** Show sales, ad results and runs in one merchant widget ([46b701a](https://github.com/sami-m-g/wovain/commit/46b701a6dd14547fedc1cbdba89b9fc3f9f6e183))
## [0.24.0](https://github.com/sami-m-g/wovain/releases/tag/v0.24.0) (2026-10-22)

### Documentation

* **loop:** Document the fix gate and credit-aware duo triggers ([00a31cc](https://github.com/sami-m-g/wovain/commit/00a31cc77f0a55c07ea2711839e55785d4a32813))

### Features

* **ops:** Gate duo fix ci/cd and code review on real need ([692af76](https://github.com/sami-m-g/wovain/commit/692af766804e542c4737141d473c06e9dae98501))
## [0.23.0](https://github.com/sami-m-g/wovain/releases/tag/v0.23.0) (2026-10-22)

### Bug Fixes

* **sci:** Publish fal clip timings only as a weekly aggregate ([e08b53e](https://github.com/sami-m-g/wovain/commit/e08b53e67a3d7e48d7d5b34093a76fa67c68a0bb))

### Features

* **video:** One short clip cropped to every ratio, measured fal gpu time in sci ([0ebd616](https://github.com/sami-m-g/wovain/commit/0ebd616144fec500bbbb477188c511f5f00d3b8e))
## [0.22.0](https://github.com/sami-m-g/wovain/releases/tag/v0.22.0) (2026-10-22)

### Bug Fixes

* **ops:** Bind auto-merge to the loop's own work ([4cb2876](https://github.com/sami-m-g/wovain/commit/4cb28768e0aebad877cc6ff0b12f5ece252752bf))
* **ops:** Fail closed on session links, review state and threads ([7527fa2](https://github.com/sami-m-g/wovain/commit/7527fa278ba912d47f6583595c52618287be3140))
* **analytics:** Isolate firestore reads and sanitize market links ([a93877a](https://github.com/sami-m-g/wovain/commit/a93877a77472d4fae8e88283ea932ae94957a250))
* **infra:** Adopt the environments ci created first ([773e822](https://github.com/sami-m-g/wovain/commit/773e8226d5f1ca475ebaabaa0c95dde017f5f0ae))
* **ads:** Accept only fal media collected from wovain's own jobs ([666ae6b](https://github.com/sami-m-g/wovain/commit/666ae6b812204ba57016af85660f4b84828a54fe))
* **campaign:** Extend the meta allowlist, record and read-back to ad concept shapes ([e448dca](https://github.com/sami-m-g/wovain/commit/e448dcaca2013fbd39da7aef9a40b37d5cb09f6e))
* **ops:** Build scout issues from server-controlled fields only ([83316e5](https://github.com/sami-m-g/wovain/commit/83316e5fe6cc829bab9f3308fd0bbc76bba98723))
* **autopilot:** Screen every concept text and carousel card before approving ads ([2637808](https://github.com/sami-m-g/wovain/commit/2637808c873449e0e18a35e056e3007e6a608c0f))
* **research:** Keep cached research and niche briefs per merchant ([d2561d0](https://github.com/sami-m-g/wovain/commit/d2561d0491cb877566f4ea2f8d6bf3b444f76ddc))
* **autopilot:** Pick from the code-ranked research themes ([8cd4230](https://github.com/sami-m-g/wovain/commit/8cd4230fb3a299f103f65017580b593281ec409c))
* **infra:** Drop schedule variables our role can't set ([8e19f59](https://github.com/sami-m-g/wovain/commit/8e19f5970cfdd0d660059f77e04925112c855f80))
* **connections:** Add connect_account and list_connections tools ([f722991](https://github.com/sami-m-g/wovain/commit/f7229915833ea099d0464e373f2d1a4a7025e55f))

### Code Refactoring

* **research:** Re-score cached qloo research and share the ranking helpers ([d1feefb](https://github.com/sami-m-g/wovain/commit/d1feefb1b5f6c380c31ed2afc6ee1a5379393626))
* **research:** Trim the qloo and tavily research code ([219c809](https://github.com/sami-m-g/wovain/commit/219c809c795a78e701663dab665abcff6a4d1719))
* **research:** Move the ip safety signal into score.ts ([6a62de9](https://github.com/sami-m-g/wovain/commit/6a62de9fca8a6307802ca87da266f4345815fe26))

### Documentation

* **loop:** Add intent, spec and plan for #26 ([20744ce](https://github.com/sami-m-g/wovain/commit/20744ce1da56f452db0fcb254615b81504b4101c))
* **analytics:** Add intent, spec and plan for #27 ([1a964d6](https://github.com/sami-m-g/wovain/commit/1a964d6f24ca65942a6f7be362d70fa0f860ddd9))
* **sci:** Add intent, spec and plan for #28 ([eca0121](https://github.com/sami-m-g/wovain/commit/eca012113ebd6ed06d1bac516c490da4968423b0))
* Add architecture, data model, devsecops stages and transcend write-up ([ce15641](https://github.com/sami-m-g/wovain/commit/ce15641e3905f1c387bee5c789911aeae8f9da3e))
* List only what the developer+ role can't set as code ([b861c1d](https://github.com/sami-m-g/wovain/commit/b861c1d96691b84fc88fcd588fc5eb835135e48a))
* **ads:** Add intent, spec and plan for #23 ([063274a](https://github.com/sami-m-g/wovain/commit/063274ad36cb0b5516a1505fc8bf436332bc6766))
* **ads:** Describe ad concepts, the paused build and the claude-ads credit ([cf1bfbc](https://github.com/sami-m-g/wovain/commit/cf1bfbc8619c2193ae9350931f8fc9db99eddfad))
* **ads:** Add verify for #23 ([9b5698e](https://github.com/sami-m-g/wovain/commit/9b5698ef568c9ba02a6419d7f05848d3e6f6c2de))
* **autopilot:** Add intent, spec and plan for #22 ([472a9ad](https://github.com/sami-m-g/wovain/commit/472a9adb083d0c05718690e08558ed2a96c6cce0))
* **autopilot:** Describe autopilot in the prd and spec, and add verify notes for #22 ([5ae1341](https://github.com/sami-m-g/wovain/commit/5ae1341f20b5eff0a2ace5408aa0473a3cffee73))
* **research:** Add intent, spec and plan for #21 ([4e04db3](https://github.com/sami-m-g/wovain/commit/4e04db3baf5feb905fbc28fdf74ed8c6131b3867))
* **research:** Add verify notes for #21 ([8bb8235](https://github.com/sami-m-g/wovain/commit/8bb823525de88a9b33d36932c4bfdaeef0fbcd7c))
* **research:** Describe the code ranking and every tavily endpoint ([9e8c894](https://github.com/sami-m-g/wovain/commit/9e8c89456aa08061ae657fb80733526a113eb0bf))
* **research:** Record the trim and drop the folded files ([f79b9b3](https://github.com/sami-m-g/wovain/commit/f79b9b3e44ced55ac4325bff13f6d531cd5e0c68))

### Features

* **ops:** Turn duo on and run the self-healing loop ([b753aab](https://github.com/sami-m-g/wovain/commit/b753aab6cfea2aa6f9ac5130497c500ce71eab55))
* **analytics:** Count the merchant funnel and scout the market weekly ([12ed409](https://github.com/sami-m-g/wovain/commit/12ed409f555ea8bd372d6d19973530e578f96bf0))
* **sci:** Measure software carbon intensity on every main pipeline ([29a71f4](https://github.com/sami-m-g/wovain/commit/29a71f4060fd23fc8ded3ead1c4226355da8bbea))
* **infra:** Start the scout flow from ci and enable the explain agent ([d76d31c](https://github.com/sami-m-g/wovain/commit/d76d31cb5c242bfa91a8b82634353b9b838e7c3f))
* **ads:** Make distinct ad concepts per product with per-concept feedback ([cabc739](https://github.com/sami-m-g/wovain/commit/cabc7395bf28cf98650bc2f1c15c3bcaab233882))
* **autopilot:** Run the journey on nemotron's decisions with hidden products and a paused campaign ([da51a34](https://github.com/sami-m-g/wovain/commit/da51a34ffc5d32754ba1dc8a16e312d5d4a97b44))
* **research:** Drive trend research and audience suggestions with qloo taste signals ([75ae5f8](https://github.com/sami-m-g/wovain/commit/75ae5f85a1d8324c4eade93e776cdb4d1dd1c5ed))
* **research:** Rank ideas in code and use tavily search, extract, map, crawl and research ([b8598d3](https://github.com/sami-m-g/wovain/commit/b8598d31b2593b097531d64eb00f3877693fb231))

### Miscellaneous

* Update AI Catalog mapping [skip ci] ([d4a1b81](https://github.com/sami-m-g/wovain/commit/d4a1b81cb84bc93eb565f8e270d0484e843a6649))
* **ci:** Run the e2e proof and demo on every pipeline, live nightly ([1b8bee9](https://github.com/sami-m-g/wovain/commit/1b8bee902cd5248c9bb7cbcad113d620a25a0c37))

### Tests

* **e2e:** Drive the whole journey and render a proof report ([6e29e2a](https://github.com/sami-m-g/wovain/commit/6e29e2a7c85af524f7977f871869d1cd04089c88))
## [0.21.0](https://github.com/sami-m-g/wovain/releases/tag/v0.21.0) (2026-10-22)

### Bug Fixes

* **design:** Confirm approvals in the browser and harden publishing ([c1c5af1](https://github.com/sami-m-g/wovain/commit/c1c5af1108b27524103922980b15bfc0c1f20161))
* **design:** Drop an approval sent with a design ([3a665e0](https://github.com/sami-m-g/wovain/commit/3a665e0b4ea5a5e160f053b4b4ed4c88b50a344f))
* **campaign:** Bind meta launch to the widget and allowlist draft arguments ([8c6ffdc](https://github.com/sami-m-g/wovain/commit/8c6ffdc9153fcfdf43646dc1644bb3ca6e471470))
* **campaign:** Confirm meta launches on wovain's page and pin drafts to the plan ([c7c2298](https://github.com/sami-m-g/wovain/commit/c7c2298bd72b497f9821e6b5beb8ccda8c8efa62))
* **campaign:** Stage and launch only the meta objects wovain recorded ([e3a62fb](https://github.com/sami-m-g/wovain/commit/e3a62fbf30a9d0e6698680a228e8d098ec3fb1e8))
* **campaign:** Refuse a launch when a recorded meta object isn't read back ([ef2bd80](https://github.com/sami-m-g/wovain/commit/ef2bd800961801a096b6b15400d4159b0fb9967f))
* **campaign:** Bind meta launch approval to a frozen draft snapshot ([d499168](https://github.com/sami-m-g/wovain/commit/d499168351f47e1874a4070dd46c31c9a2233ee5))

### Documentation

* **design:** Add intent, spec and plan for #24 ([861385f](https://github.com/sami-m-g/wovain/commit/861385fff53f5ce65000677618c28e452f78ed7b))
* **design:** Describe drops in the prd, spec and app map ([a3ba6af](https://github.com/sami-m-g/wovain/commit/a3ba6af26f41a83af2dd3dd4ae6483b0bc2d3224))
* **design:** Add verify for #24 ([73f80d0](https://github.com/sami-m-g/wovain/commit/73f80d08e7599356c9d0d4d16a046371b44b9c90))
* **skills:** Add the print-on-demand overlay for the optimizer ([41c98f6](https://github.com/sami-m-g/wovain/commit/41c98f664b846fe4824290408de32e83cb13c785))
* **readme:** List the observability api key as manual ([3551151](https://github.com/sami-m-g/wovain/commit/35511516bf593f9b0f97dded040421230f81bff9))
* **connections:** Add intent, spec and plan for meta connect (#19) ([4649fe1](https://github.com/sami-m-g/wovain/commit/4649fe1c2fe80ca1c0f242b0fd402d3b24ca965d))
* **connections:** Describe meta connect, the meta app setup and verification ([699cfa1](https://github.com/sami-m-g/wovain/commit/699cfa1c2af81f9949bdbaf6efd004bb98478d3b))

### Features

* **design:** Turn one idea into a priced multi-product drop ([6ea6214](https://github.com/sami-m-g/wovain/commit/6ea621423163bb0d3c8c64561ceaff4b5a50dc8b))
* **optimizer:** Add shared schemas, rules and math for the optimizer ([0ec61da](https://github.com/sami-m-g/wovain/commit/0ec61dac0d2690ef1701978b11d35b1bdcacd7d6))
* **connections:** Connect meta through wovain's own meta app ([8af6f04](https://github.com/sami-m-g/wovain/commit/8af6f04604497a9d8f958e226cda5aa848bb7636))

### Miscellaneous

* **skills:** Vendor ten claude-ads skills pinned by hash ([0ac4899](https://github.com/sami-m-g/wovain/commit/0ac489903607b05592c2be9eab2457b56a91ed23))

### Tests

* **optimizer:** Keep the pod overlay's rule ids in step with the code ([79b664c](https://github.com/sami-m-g/wovain/commit/79b664c712f61eec9fa0de95c7a82561cf7a73d2))
## [0.20.0](https://github.com/sami-m-g/wovain/releases/tag/v0.20.0) (2026-10-22)

### Bug Fixes

* **connections:** Bind connect links to the merchant's browser sign-in ([c9bcce7](https://github.com/sami-m-g/wovain/commit/c9bcce7f5fdc3d775876994d8a894f633ad4076f))

### Code Refactoring

* **connections:** Simplify the lease and the refused-grant path ([9525e59](https://github.com/sami-m-g/wovain/commit/9525e59bb3df390085563fd722953361ecbbe45c))

### Documentation

* **connections:** Add intent, spec and plan for #19 ([9613b39](https://github.com/sami-m-g/wovain/commit/9613b3904f570e16d2c1ece0bea70b805ee4226a))
* **connections:** Describe merchant connections and the kms key ([b7ebb24](https://github.com/sami-m-g/wovain/commit/b7ebb249df446a4f4d2eca24047c3162ce6dd145))

### Features

* **connections:** Store merchant grants encrypted with cloud kms ([a323ffc](https://github.com/sami-m-g/wovain/commit/a323ffcba22bf49abd011e5e701c556e52157956))
* **connections:** Connect fourthwall and fal through wovain ([68e7453](https://github.com/sami-m-g/wovain/commit/68e7453ffb73f879d8262d2a535a0372131c6664))
* **ads:** Generate videos on the merchant's own fal account ([e69ef0a](https://github.com/sami-m-g/wovain/commit/e69ef0a3563abd98d58b7507ce8b35c0b8cff1f0))
## [0.19.1](https://github.com/sami-m-g/wovain/releases/tag/v0.19.1) (2026-10-22)

### Bug Fixes

* **research:** Number trend results from 1 and drop hand-rolled ranking ([6e05bfa](https://github.com/sami-m-g/wovain/commit/6e05bfaa7baddcbe01d1891703c64700f5fed196))

### Documentation

* **research:** Add intent, spec and plan for #20 ([c3e3085](https://github.com/sami-m-g/wovain/commit/c3e30851127d898337252d5e3a25185e007d79f2))
* **research:** Add verify notes for #20 ([e9fcc65](https://github.com/sami-m-g/wovain/commit/e9fcc65ba0e319cb70683e83b7abd5e757d7a799))
## [0.19.0](https://github.com/sami-m-g/wovain/releases/tag/v0.19.0) (2026-10-22)

### Bug Fixes

* **research:** Treat search results as untrusted and share one genkit ([4672c10](https://github.com/sami-m-g/wovain/commit/4672c10b927a9ef97103f35720cd00a8cbf7ceb1))

### Documentation

* **research:** Add intent, spec and plan for #3 ([0c2b14d](https://github.com/sami-m-g/wovain/commit/0c2b14d5010a83502823428e3cb627ef76302708))

### Features

* **research:** Add tavily trend research and trademark screen ([577124d](https://github.com/sami-m-g/wovain/commit/577124d85fc63fef70bfc62b81a5ddf630936fc1))
## [0.18.0](https://github.com/sami-m-g/wovain/releases/tag/v0.18.0) (2026-10-22)

### Features

* **ai:** Turn on the design judge with the nebius key ([858beb9](https://github.com/sami-m-g/wovain/commit/858beb997b54e5359c687b1d82124fb8a0539953))

### Miscellaneous

* **skills:** Add /capture to turn feedback into work items ([db1a36f](https://github.com/sami-m-g/wovain/commit/db1a36fd851ff3e745c37d218d2dba3ba6ad5649))
* **skills:** Fix screenshot upload flag in /capture ([53b3484](https://github.com/sami-m-g/wovain/commit/53b34840a0ec58b7ee5b3f6c2ecf1a97103fd95d))
* **skills:** Share project skills with gitlab duo ([73919ff](https://github.com/sami-m-g/wovain/commit/73919ff831bbceefeba6332dd5f6e551e9c04edb))
* Add the tavily mcp for dev agents ([c3e89f8](https://github.com/sami-m-g/wovain/commit/c3e89f8399c6ba06d0e4a488ab2f31ec3fd74cd2))
## [0.17.0](https://github.com/sami-m-g/wovain/releases/tag/v0.17.0) (2026-10-22)

### Bug Fixes

* **duo:** Keep the scout digest confidential and treat all GitLab content as untrusted ([7e47ab7](https://github.com/sami-m-g/wovain/commit/7e47ab7b6a38e433bcac1b7d354cb697eb4407f3))
* **skills:** Request the duo reviewer only when its trigger is on ([6342bb8](https://github.com/sami-m-g/wovain/commit/6342bb84d7e7e7bf92d63af51a491f6e4d5760a0))
* **settings:** Honor alert and utm toggles, remove unread settings ([5383342](https://github.com/sami-m-g/wovain/commit/5383342ec1d4a558b0bc871828c3e2a16e1083c0))
* **infra:** Adopt the labels agents created by hand ([4988283](https://github.com/sami-m-g/wovain/commit/4988283ef5cbdb4f920df11b97b76f71121f2fdd))
* **infra:** Let gitlab order the workflow board lists ([6b9e649](https://github.com/sami-m-g/wovain/commit/6b9e649efd045dd91c00be3f671695c380292d32))
* **ai:** Redact genkit span payloads and bound the judge brief ([2017ba9](https://github.com/sami-m-g/wovain/commit/2017ba939a859e0bffadc169f9a99c44d4250256))
* **telemetry:** Export genkit spans with an attribute allowlist ([1b16b6e](https://github.com/sami-m-g/wovain/commit/1b16b6ebc0ba3c167c0f582ba75492bb60323f0a))

### Code Refactoring

* **widgets:** Share the widget shell and action handling ([31a955a](https://github.com/sami-m-g/wovain/commit/31a955ac535dd83161838595b09c9c37664a1308))
* **auth:** Gate /mcp with the mcp sdk's requireBearerAuth ([70feb11](https://github.com/sami-m-g/wovain/commit/70feb11d453803fbe16135d0c72f3fe92eb8e46f))
* **home:** Inline the home page and drop the pages layer ([af47bfa](https://github.com/sami-m-g/wovain/commit/af47bfae49a757e6c85c98ca7083aadf03c5f3eb))
* **server:** Add fetchJson and move the artwork PUT into lib ([44bf94b](https://github.com/sami-m-g/wovain/commit/44bf94bc84fb5d29ecf11c320bb306c11fc219be))

### Documentation

* Add the issue workflow, the /issue skill and the no-hand-rolling rule ([1e55a28](https://github.com/sami-m-g/wovain/commit/1e55a28c28ef982c680c5ea48054c132fd32aa84))
* Add per-change intent, spec, plan and verify docs ([0f10f93](https://github.com/sami-m-g/wovain/commit/0f10f939dadb99cef3bc0dd1cdecf0d9665a2351))
* **settings:** Add intent, spec and plan for #10 ([81b0fb0](https://github.com/sami-m-g/wovain/commit/81b0fb00cd306b46a461cc414398504d7c403f9e))
* **widgets:** Add intent, spec and plan for #12 ([2c5541a](https://github.com/sami-m-g/wovain/commit/2c5541a2ce3c27d9868d418a91d9ffcaa7652809))
* **auth:** Add intent, spec and plan for #11 ([7fe8b98](https://github.com/sami-m-g/wovain/commit/7fe8b98c9d981acc3883e0bb1f2b57b207b1b852))
* **auth:** Add verify notes for #11 ([6249722](https://github.com/sami-m-g/wovain/commit/6249722ed37a481d458f21633c448b38c8282ce5))
* **home:** Add intent, spec and plan for #14 ([22400e3](https://github.com/sami-m-g/wovain/commit/22400e3b832b98697a747c66c23539354c203721))
* **server:** Add intent, spec and plan for #13 ([c44bb7e](https://github.com/sami-m-g/wovain/commit/c44bb7ebed371b82c06cdc34d105e84276bf8d52))
* Correct which credits duo flows bill ([30e66fd](https://github.com/sami-m-g/wovain/commit/30e66fdb07f5ad490301b507e7340da9af822135))
* **ai:** Add intent, spec and plan for #2 ([50ac814](https://github.com/sami-m-g/wovain/commit/50ac81481fb4842adce7fbcf739ad8a2161fef9d))

### Features

* **infra:** Manage issue labels and the workflow board in code ([d0d4d71](https://github.com/sami-m-g/wovain/commit/d0d4d71c829544a119f9e0f4829cabed2c8de8cb))
* **duo:** Post a daily digest from the scout flow ([dd53e5b](https://github.com/sami-m-g/wovain/commit/dd53e5b337a8875eb576afd2c678b2b1ef4bde8f))
* **infra:** Add intent, spec and plan stages to the workflow board ([7eb49ec](https://github.com/sami-m-g/wovain/commit/7eb49ec3cde914b0179207704a1fdbb476e1c1cd))
* **duo:** File scout findings as intents ([c357295](https://github.com/sami-m-g/wovain/commit/c3572953349c5ee8de3267f2e06d65cdceeefd71))
* **infra:** Manage workos mcp resource indicators ([e09e33b](https://github.com/sami-m-g/wovain/commit/e09e33b306145f1a811953d31c82efa6bc989078))
* **ai:** Check designs with nemotron through genkit on nebius ([d1fbcc6](https://github.com/sami-m-g/wovain/commit/d1fbcc68df8aaa89c7738f6c066e8ba9157ab590))

### Miscellaneous

* **duo:** Limit flow triggers to human actions and failures on main ([078aca5](https://github.com/sami-m-g/wovain/commit/078aca569d045beb8aa5476fe65fb0f52e4d52ca))
* **ci:** Add architecture and duplication gates and a complexity ratchet ([3a13a32](https://github.com/sami-m-g/wovain/commit/3a13a326ceb251d1319575a92409aa89055aaea4))
* **skills:** Enable review plugins and run them from /issue ([067db28](https://github.com/sami-m-g/wovain/commit/067db282d6e4c64a394412d6544a337e9c74ef72))
* Update AI Catalog mapping [skip ci] ([7a2769a](https://github.com/sami-m-g/wovain/commit/7a2769a9252c19dfc7c994e30b891a1a20460060))
* **infra:** Manage workos redirect uris and add api key secrets ([8bad90e](https://github.com/sami-m-g/wovain/commit/8bad90e06b5330e748563f1d6f143fdeaf4ddef9))
## [0.16.0](https://github.com/sami-m-g/wovain/releases/tag/v0.16.0) (2026-10-22)

### Bug Fixes

* **ci:** Build the generated pulumi graphql sdk after install ([36af873](https://github.com/sami-m-g/wovain/commit/36af873dda1c5f6928c44d7be811d55e09177500))
* **infra:** Pin the graphql terraform provider version ([e4f5409](https://github.com/sami-m-g/wovain/commit/e4f540996326236d2655a92c098e2549094472d5))
* **infra:** Fail on unknown duo names and read the synced flow mapping ([546b868](https://github.com/sami-m-g/wovain/commit/546b868afc69ec492252fa8ed6b9fa896a9cfdf9))
* **infra:** Stop managing the scout custom flow ([a2d7fbf](https://github.com/sami-m-g/wovain/commit/a2d7fbfb2425a2ace593e80a8b5df33604699cc8))

### Code Refactoring

* **infra:** Generate the pulumi graphql sdk and move duo triggers into stack config ([dcd2b9b](https://github.com/sami-m-g/wovain/commit/dcd2b9b7cf04066b5eec0df5ef847a7634d1a239))

### Features

* **infra:** Manage duo flow triggers with pulumi and sync custom flows ([c771655](https://github.com/sami-m-g/wovain/commit/c771655a588762163f5edf39a93113f4e84b0c10))
* **infra:** Switch the code review and fix pipeline triggers off ([1389051](https://github.com/sami-m-g/wovain/commit/13890519e527730c957b5359707300c0803b97a8))
* **infra:** Manage gitlab ci settings, the github mirror and firebase storage in code ([11e9def](https://github.com/sami-m-g/wovain/commit/11e9def08b52679fcc6e523107d35ad3ad13b50f))

### Miscellaneous

* **infra:** Stop tracking the generated pulumi graphql sdk ([88cc5a5](https://github.com/sami-m-g/wovain/commit/88cc5a576ebe29e5e0a5aa6e2ccca89e17f9a088))
* **ci:** Rerun the pipeline skipped by the previous commit message ([3f79a40](https://github.com/sami-m-g/wovain/commit/3f79a40636ca6ffe3a653ec83fb8733972aee8cb))
* Update AI Catalog mapping [skip ci] ([b38f201](https://github.com/sami-m-g/wovain/commit/b38f2018e2a4278c2c5ecdf0c5bf40b21ba98d2d))
## [0.15.0](https://github.com/sami-m-g/wovain/releases/tag/v0.15.0) (2026-10-21)

### Bug Fixes

* **infra:** Trust each ci account only from its gitlab environment ([14d53ac](https://github.com/sami-m-g/wovain/commit/14d53acaa833c8f7e6cb60ae19c481d1f6f0ed65))
* **ci:** Restore the github mirror job and deploy over its ssh key ([aa5bf96](https://github.com/sami-m-g/wovain/commit/aa5bf964d5e8246bf260fcc5a2a71b6174980059))
* **hosting:** Skip lifecycle scripts in the app hosting install ([02cadc5](https://github.com/sami-m-g/wovain/commit/02cadc5c1ea3d7d0218edcdece00271785b02e5d))
* **infra:** Let the app hosting account read secret metadata ([85c0528](https://github.com/sami-m-g/wovain/commit/85c0528bffd5821199c32c317822b86fcad6c7fc))
* **hosting:** Use the pnpm config prefix to skip install scripts ([605939a](https://github.com/sami-m-g/wovain/commit/605939abe02772e434f77762f1f19f0918fede27))

### Code Refactoring

* **widgets:** Share one entry and html across widgets ([a1c0b33](https://github.com/sami-m-g/wovain/commit/a1c0b3301845ad0498a76e6124bee1b14a98ad4a))

### Documentation

* Move planning docs from devpost to docs ([cc0ff4f](https://github.com/sami-m-g/wovain/commit/cc0ff4fa0a42786e71b47957c3fb57d8ed3984e8))

### Features

* Move hosting to firebase, switch to pnpm and add pulumi infra ([86bea32](https://github.com/sami-m-g/wovain/commit/86bea329b5793b30e0a604874fe6b0bdbb055674))
* **deploy:** Upload app hosting source from gitlab ci instead of github ([1980ef8](https://github.com/sami-m-g/wovain/commit/1980ef8599e81228f1069bce695552faed481209))
* **infra:** Manage secret values as kms-encrypted pulumi config ([e61b6f9](https://github.com/sami-m-g/wovain/commit/e61b6f92da386a7f17b08c2471b30d0f36d03f08))

### Miscellaneous

* Mirror main to github after every main pipeline ([ab6055c](https://github.com/sami-m-g/wovain/commit/ab6055c8ed1d8a06381ba97fc85f000666ecd2f4))
* Drop trend research and its unused api keys ([59d4410](https://github.com/sami-m-g/wovain/commit/59d4410bc1e1cdec3cd51ccc6fcb5a7425e67635))
* **skills:** Copy course skills on bun install instead of committing symlinks ([22addab](https://github.com/sami-m-g/wovain/commit/22addab54a1decf7e5c15a3c78ad577b7dc5ad32))
* Format and lint docs instead of ignoring them ([4b35f61](https://github.com/sami-m-g/wovain/commit/4b35f6169411130efab01f2cfd1457c252ce3871))
* Move tool configs into .config ([f0e82cf](https://github.com/sami-m-g/wovain/commit/f0e82cfce8b1939b54661dd6c53ca7aa650701e8))
## [0.14.0](https://github.com/sami-m-g/wovain/releases/tag/v0.14.0) (2026-10-21)

### Documentation

* Use the workos staging environment for production ([d33ecc1](https://github.com/sami-m-g/wovain/commit/d33ecc1dee10f7b23e7a05f4af1e230a530c7d41))

### Features

* **server:** Move sign-in to workos authkit ([c41af55](https://github.com/sami-m-g/wovain/commit/c41af55b552e6df3cf97e43a24df6531ed8c121e))

### Miscellaneous

* Run jobs in parallel and drop the merge request previews ([5d8981c](https://github.com/sami-m-g/wovain/commit/5d8981c533888078eca913193788ab3978447118))
* Remove neon.ts now that nothing applies it ([f02a83a](https://github.com/sami-m-g/wovain/commit/f02a83a13d2e7c40c48634a17c3acc4e3df0e655))
## [0.13.1](https://github.com/sami-m-g/wovain/releases/tag/v0.13.1) (2026-10-21)

### Bug Fixes

* **server:** Keep one widgets dir env key after the rebase ([fc58ac3](https://github.com/sami-m-g/wovain/commit/fc58ac3e7c2b11d11aaeaae4ca28a9a17e2c379d))

### Code Refactoring

* **widgets:** Rename cards to widgets ([1cdf21f](https://github.com/sami-m-g/wovain/commit/1cdf21f91081c268f70fc48ccaef8bb605f9a56a))
* **server:** Merge web and db into one hono server ([b24ce5f](https://github.com/sami-m-g/wovain/commit/b24ce5f0fbc988cbda4d6d3761b2ed47b7e7ad52))

### Documentation

* Restore the app map and its stylesheet ([219f8e2](https://github.com/sami-m-g/wovain/commit/219f8e246ada25a916b055c8215ed558171903ff))
* Inline plan.css into the app map ([f4ccb9e](https://github.com/sami-m-g/wovain/commit/f4ccb9ea0dcd63fcbda3f86d37c8eb401f0db11c))
* Trim the app map css to the rules it uses ([d51eac2](https://github.com/sami-m-g/wovain/commit/d51eac2cd4bb3561a234644bf09c2a3d40356c2b))
* Describe the mcp-only server in the planning docs ([6b3d5df](https://github.com/sami-m-g/wovain/commit/6b3d5df0d29bf392f8c3c9eea10f40688ea92f39))

### Miscellaneous

* **renovate:** Move the config into .gitlab ([821e86f](https://github.com/sami-m-g/wovain/commit/821e86f55b8503f6fdd6a7731f168c2c23efbe9b))
* Replace scripts with config and drop the html planning pages ([aea30da](https://github.com/sami-m-g/wovain/commit/aea30dab1187b8a0cd4c8eaf8f056021a598680a))
* **format:** Leave the semantic-release changelog unformatted ([e0a202a](https://github.com/sami-m-g/wovain/commit/e0a202a87812598fd5b8df40ad0b77553f5d0c37))
* Remove sync-plan and the planning docs' html pages ([c8c87fb](https://github.com/sami-m-g/wovain/commit/c8c87fbbc0d8af852f44ebfd78647fa3bac8f94c))
## [0.13.0](https://github.com/sami-m-g/wovain/releases/tag/v0.13.0) (2026-10-21)

### Features

* **server:** Serve the step playbooks over mcp and remove the chatgpt plugin ([cc507b4](https://github.com/sami-m-g/wovain/commit/cc507b4fbdae60ad089eb098a41dc7b493e368ab))

### Miscellaneous

* **release:** Backfill versions 0.2.0 to 0.12.2 and fix the asset label ([0c949f6](https://github.com/sami-m-g/wovain/commit/0c949f6fdce6c97a16d4ccb97d99713ce99c03ef))
* **preview:** Take branch parent and ttl from neon.ts and scan merge requests ([53bb009](https://github.com/sami-m-g/wovain/commit/53bb009caaeb7827b6a45ce758312d20e494272e))
## [0.12.2](https://github.com/sami-m-g/wovain/releases/tag/v0.12.2) (2026-10-20)

### Bug Fixes

* **ads:** Remove the ffmpeg caption and brand burn-in ([38f9a6d](https://github.com/sami-m-g/wovain/commit/38f9a6dd174c48b423a6f6c81c182f05091206cf))
## [0.12.1](https://github.com/sami-m-g/wovain/releases/tag/v0.12.1) (2026-10-20)

### Bug Fixes

* **web:** Record only the error class on mcp spans ([1126644](https://github.com/sami-m-g/wovain/commit/1126644f4055bbf95e6a1ccd3a172a72c89fe67c))
## [0.12.0](https://github.com/sami-m-g/wovain/releases/tag/v0.12.0) (2026-10-20)

### Code Refactoring

* Rename wovain-foss to wovain ([0dc800b](https://github.com/sami-m-g/wovain/commit/0dc800b5a4924a00ae047cec624a55637733ddaf))

### Features

* **web:** Trace mcp requests to gitlab observability ([3a7a1b3](https://github.com/sami-m-g/wovain/commit/3a7a1b3c28b4d0b4daea5fdd3bcadf4df7f06b3c))

### Miscellaneous

* Join the gitlab hackathon workspace history ([40b1dfb](https://github.com/sami-m-g/wovain/commit/40b1dfb720b8a41d8597d3eeee9105eef9a36f99))
* Move ci and deploys to gitlab ([67e697f](https://github.com/sami-m-g/wovain/commit/67e697f93b8028b2cdfff5fcbad11b914a7fd378))
* Add security scans, packaging, neon previews, releases and renovate ([8cfcf52](https://github.com/sami-m-g/wovain/commit/8cfcf52650fbefe3da5495f30914e575338ab5b3))
* Keep the bun cache out of lint, fork previews from dev ([27da51b](https://github.com/sami-m-g/wovain/commit/27da51bea8b2d88f51a8ce98f29e54e38461dcbc))
* Start a fresh bun cache so the old in-repo cache isn't restored ([475dc35](https://github.com/sami-m-g/wovain/commit/475dc35a9fff409a7e4e65cc1968ea03fc195197))
* Trust ffmpeg-static's postinstall and log where its binary is ([8e8fb30](https://github.com/sami-m-g/wovain/commit/8e8fb308a391c22b2ce407ee68a7d4279b936b83))

### Tests

* Show finish_video's error text when it fails ([a735be5](https://github.com/sami-m-g/wovain/commit/a735be5da475d412ba48d8ee3a19d913e2df4c62))
## [0.11.3](https://github.com/sami-m-g/wovain/releases/tag/v0.11.3) (2026-10-20)

### Bug Fixes

* **web:** Show the wovain logo in chatgpt ([ae2b677](https://github.com/sami-m-g/wovain/commit/ae2b6778d23e6919ab09333aa2472446550cfbff))
## [0.11.2](https://github.com/sami-m-g/wovain/releases/tag/v0.11.2) (2026-10-20)

### Bug Fixes

* **build:** Go back to vercel.json so installs honour bun.lock ([ce5d381](https://github.com/sami-m-g/wovain/commit/ce5d38120eeb58503b27fafd1cad5e1f3bb60234))

### Code Refactoring

* **db:** Move to drizzle on neon with pglite tests ([0b1d69f](https://github.com/sami-m-g/wovain/commit/0b1d69ff54995465c264d0b1392e341915bb8d1d))
## [0.11.1](https://github.com/sami-m-g/wovain/releases/tag/v0.11.1) (2026-10-20)

### Bug Fixes

* **web:** Limit sign-in to listed emails and flag unverified apps ([0eda885](https://github.com/sami-m-g/wovain/commit/0eda8857a70c9788cdc1dcecdde0b99b3299e942))
## [0.11.0](https://github.com/sami-m-g/wovain/releases/tag/v0.11.0) (2026-10-20)

### Features

* **web:** Sign in through better auth oauth for chatgpt ([14abc7a](https://github.com/sami-m-g/wovain/commit/14abc7a6de923bcc3ebdc6651824ace2225b523b))
## [0.10.0](https://github.com/sami-m-g/wovain/releases/tag/v0.10.0) (2026-10-20)

### Features

* **server:** Store records in neon and artwork in blob ([4351a76](https://github.com/sami-m-g/wovain/commit/4351a76cc9a0022c56042a914e7fd7dbd34df912))

### Miscellaneous

* **sync-plan:** Port the plan sync check to typescript ([bc8f3fa](https://github.com/sami-m-g/wovain/commit/bc8f3fa97f67df2902868fe16440699f9c795f15))
## [0.9.1](https://github.com/sami-m-g/wovain/releases/tag/v0.9.1) (2026-10-20)

### Bug Fixes

* **build:** Skip git hooks and skill sync on vercel installs ([bea2507](https://github.com/sami-m-g/wovain/commit/bea25076723f9cb23cbc5a26aef0deb481c50bff))
## [0.9.0](https://github.com/sami-m-g/wovain/releases/tag/v0.9.0) (2026-10-20)

### Features

* **web:** Host the mcp server on next.js and drop stdio ([c549690](https://github.com/sami-m-g/wovain/commit/c54969035d94020e79098b0a910b82778133fa05))

### Miscellaneous

* Run all tooling on bun and drop .nvmrc ([2464d7f](https://github.com/sami-m-g/wovain/commit/2464d7fab5aa3a0d2abdd1956b5d80e9ae40e3e7))
## [0.8.2](https://github.com/sami-m-g/wovain/releases/tag/v0.8.2) (2026-10-20)

### Bug Fixes

* **settings:** Cache fal prices for 30 minutes ([4f372be](https://github.com/sami-m-g/wovain/commit/4f372beb691703e089201d0170d2f858ffa84dfa))

### Code Refactoring

* Dedupe shared helpers, adopt sdk built-ins and move the store to sqlite ([ce6bdc5](https://github.com/sami-m-g/wovain/commit/ce6bdc51b56c6632f7ca65b42a2801c5eec243f9))

### Documentation

* **checklist:** Move slice 7 to later ([c744d79](https://github.com/sami-m-g/wovain/commit/c744d792ac835dd213bbb3aade1faf14d49e9078))
* Add app map and record the learning wrap-up ([77ea7fd](https://github.com/sami-m-g/wovain/commit/77ea7fd9eb38a073a59313daa34604da1301528d))
* **checklist:** Tick slice 4 after the live campaign check ([e4bafc7](https://github.com/sami-m-g/wovain/commit/e4bafc7323e672277a50ae58b8d158fe632dbfb2))
* Add readme and mit license ([0aaf4da](https://github.com/sami-m-g/wovain/commit/0aaf4da67461a4533c1412e724ee68599c6650f5))
## [0.8.1](https://github.com/sami-m-g/wovain/releases/tag/v0.8.1) (2026-10-19)

### Bug Fixes

* **campaign:** Allow only meta https links on the campaign card ([0050a47](https://github.com/sami-m-g/wovain/commit/0050a4795eeff49abe4b21662cfcf395e2c2b0af))
## [0.8.0](https://github.com/sami-m-g/wovain/releases/tag/v0.8.0) (2026-10-19)

### Features

* **campaign:** Launch advantage+ campaign with automated rules ([f60ff0b](https://github.com/sami-m-g/wovain/commit/f60ff0b013f325fc670c0ca2e3de2a36a8c8b1c2))
## [0.7.1](https://github.com/sami-m-g/wovain/releases/tag/v0.7.1) (2026-10-19)

### Bug Fixes

* **ads:** Restrict ffmpeg to local files with forced input formats ([6818ffd](https://github.com/sami-m-g/wovain/commit/6818ffd9244eefa09dc1b497859d394f87792739))
## [0.7.0](https://github.com/sami-m-g/wovain/releases/tag/v0.7.0) (2026-10-19)

### Features

* **ads:** Add ad card with ugc videos, captions and breakeven ([0388662](https://github.com/sami-m-g/wovain/commit/038866241a16704f6d75688cd9be670301d871fa))
## [0.6.0](https://github.com/sami-m-g/wovain/releases/tag/v0.6.0) (2026-10-19)

### Code Refactoring

* Rename workspace packages to @wovain-foss ([ac0bfdc](https://github.com/sami-m-g/wovain/commit/ac0bfdca43ea7a73536fbd10e93659895aa844ba))

### Features

* **settings:** Default the video model to MiniMax H3 Max Reference ([cb353c3](https://github.com/sami-m-g/wovain/commit/cb353c3cd1e88a50c80e552d519829d79fdd633e))

### Miscellaneous

* **storybook:** Add autodocs and ChatGPT-width viewports ([cfd8ddc](https://github.com/sami-m-g/wovain/commit/cfd8ddc770e09c0f098f0a418e326fa2f7f7e5b2))
* **ci:** Add ci workflow and dependabot ([876c229](https://github.com/sami-m-g/wovain/commit/876c229b059d9fc72d49bb51ced7c52f465bc193))
## [0.5.0](https://github.com/sami-m-g/wovain/releases/tag/v0.5.0) (2026-10-19)

### Features

* **settings:** Add reference-to-video models that keep the print ([291e2bf](https://github.com/sami-m-g/wovain/commit/291e2bfea1494ef4c0687dbe923bfdd5eed2f67f))
## [0.4.0](https://github.com/sami-m-g/wovain/releases/tag/v0.4.0) (2026-10-19)

### Features

* **settings:** Add cheaper video models and live fal prices ([9cd832f](https://github.com/sami-m-g/wovain/commit/9cd832fad1b41da6c52188a3abcd8162614bc0b0))
## [0.3.1](https://github.com/sami-m-g/wovain/releases/tag/v0.3.1) (2026-10-19)

### Bug Fixes

* **server:** Tighten artwork download and upload checks ([6ec6c23](https://github.com/sami-m-g/wovain/commit/6ec6c23a12824b4520dac92ffedc1a54932d680f))
## [0.3.0](https://github.com/sami-m-g/wovain/releases/tag/v0.3.0) (2026-10-19)

### Features

* **design:** Add design card and publish to fourthwall on approve ([b436f53](https://github.com/sami-m-g/wovain/commit/b436f53e059a92d7d61a4f4373c3663cf7e1499c))
## [0.2.1](https://github.com/sami-m-g/wovain/releases/tag/v0.2.1) (2026-10-19)

### Bug Fixes

* **server:** Guard http mode with token and host checks, cap budgets ([bb03605](https://github.com/sami-m-g/wovain/commit/bb03605ba03c1eb7a3741e26eef49bc29cf231f1))
## [0.2.0](https://github.com/sami-m-g/wovain/releases/tag/v0.2.0) (2026-10-19)

### Documentation

* **scope:** Add approved project scope and plugin settings ([ad634f1](https://github.com/sami-m-g/wovain/commit/ad634f18fda51ac2d06ddba6fd0265afb7b1f886))
* **prd:** Add approved product requirements and design context ([33dd9e3](https://github.com/sami-m-g/wovain/commit/33dd9e3bf283c03238bff53f6a71e1d2f10147c4))
* **spec:** Add approved technical spec and sync prd and scope ([9bb2b93](https://github.com/sami-m-g/wovain/commit/9bb2b93845d3c8b211c45b905e038f9d9878e16e))
* **checklist:** Add approved build checklist ([330f2e2](https://github.com/sami-m-g/wovain/commit/330f2e254205accf16545556cd4cb2c82b6b0888))

### Features

* **server:** Add plugin skeleton, settings store and settings card ([270531c](https://github.com/sami-m-g/wovain/commit/270531cf48c8a0bb49a3f0dbfd16f407f641f59a))

### Miscellaneous

* Add .gitignore for learner profile and local credentials ([ae8348a](https://github.com/sami-m-g/wovain/commit/ae8348abe38081995e1bf43a832048bc25da2902))
* Add sync-plan hook, MCP servers, and agent guide ([3aca0d6](https://github.com/sami-m-g/wovain/commit/3aca0d6c963993aab92dde0b2083a763d743e3fb))
* Add bun workspaces, ultracite, typescript 7 and lefthook ([3765f6c](https://github.com/sami-m-g/wovain/commit/3765f6c72bc8fd5c8dfc438fe724239f0f100386))
* Add knip and restore course skills from skills-lock ([413802e](https://github.com/sami-m-g/wovain/commit/413802e5676fc2660ae8d5630a90d62c18c52aa4))
* **skills:** Check scope, prd and spec for changed facts in sync-plan ([93948c8](https://github.com/sami-m-g/wovain/commit/93948c8d3169dcd72f0c4a1f81e4f41042a18e8d))
## [0.1.0](https://github.com/sami-m-g/wovain/releases/tag/v0.1.0) (2026-10-19)

### Miscellaneous

* Initial commit with course skills and Claude Code settings ([8bdfde3](https://github.com/sami-m-g/wovain/commit/8bdfde3365434c93f2dee2d9489fd5dd4ef2dda1))
