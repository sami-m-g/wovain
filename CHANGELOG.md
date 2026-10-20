# [0.2.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.1.0...v0.2.0) (2026-10-20)


### Bug Fixes

* **ads:** remove the ffmpeg caption and brand burn-in ([38f9a6d](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/38f9a6dd174c48b423a6f6c81c182f05091206cf))
* **ads:** restrict ffmpeg to local files with forced input formats ([6818ffd](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/6818ffd9244eefa09dc1b497859d394f87792739))
* **build:** go back to vercel.json so installs honour bun.lock ([ce5d381](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/ce5d38120eeb58503b27fafd1cad5e1f3bb60234))
* **build:** skip git hooks and skill sync on vercel installs ([bea2507](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/bea25076723f9cb23cbc5a26aef0deb481c50bff))
* **campaign:** allow only meta https links on the campaign card ([0050a47](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/0050a4795eeff49abe4b21662cfcf395e2c2b0af))
* **server:** guard http mode with token and host checks, cap budgets ([bb03605](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/bb03605ba03c1eb7a3741e26eef49bc29cf231f1))
* **server:** tighten artwork download and upload checks ([6ec6c23](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/6ec6c23a12824b4520dac92ffedc1a54932d680f))
* **settings:** cache fal prices for 30 minutes ([4f372be](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/4f372beb691703e089201d0170d2f858ffa84dfa))
* **web:** limit sign-in to listed emails and flag unverified apps ([0eda885](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/0eda8857a70c9788cdc1dcecdde0b99b3299e942))
* **web:** record only the error class on mcp spans ([1126644](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/1126644f4055bbf95e6a1ccd3a172a72c89fe67c))
* **web:** show the wovain logo in chatgpt ([ae2b677](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/ae2b6778d23e6919ab09333aa2472446550cfbff))


### Features

* **ads:** add ad card with ugc videos, captions and breakeven ([0388662](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/038866241a16704f6d75688cd9be670301d871fa))
* **campaign:** launch advantage+ campaign with automated rules ([f60ff0b](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/f60ff0b013f325fc670c0ca2e3de2a36a8c8b1c2))
* **design:** add design card and publish to fourthwall on approve ([b436f53](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/b436f53e059a92d7d61a4f4373c3663cf7e1499c))
* **server:** add plugin skeleton, settings store and settings card ([270531c](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/270531cf48c8a0bb49a3f0dbfd16f407f641f59a))
* **server:** store records in neon and artwork in blob ([4351a76](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/4351a76cc9a0022c56042a914e7fd7dbd34df912))
* **settings:** add cheaper video models and live fal prices ([9cd832f](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/9cd832fad1b41da6c52188a3abcd8162614bc0b0))
* **settings:** add reference-to-video models that keep the print ([291e2bf](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/291e2bfea1494ef4c0687dbe923bfdd5eed2f67f))
* **settings:** default the video model to MiniMax H3 Max Reference ([cb353c3](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/cb353c3cd1e88a50c80e552d519829d79fdd633e))
* **web:** host the mcp server on next.js and drop stdio ([c549690](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/c54969035d94020e79098b0a910b82778133fa05))
* **web:** sign in through better auth oauth for chatgpt ([14abc7a](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/14abc7a6de923bcc3ebdc6651824ace2225b523b))
* **web:** trace mcp requests to gitlab observability ([3a7a1b3](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/3a7a1b3c28b4d0b4daea5fdd3bcadf4df7f06b3c))
