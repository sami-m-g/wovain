# [0.16.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.15.0...v0.16.0) (2026-10-22)


### Bug Fixes

* **ci:** build the generated pulumi graphql sdk after install ([36af873](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/36af873dda1c5f6928c44d7be811d55e09177500))
* **infra:** fail on unknown duo names and read the synced flow mapping ([546b868](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/546b868afc69ec492252fa8ed6b9fa896a9cfdf9))
* **infra:** pin the graphql terraform provider version ([e4f5409](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/e4f540996326236d2655a92c098e2549094472d5))
* **infra:** stop managing the scout custom flow ([a2d7fbf](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/a2d7fbfb2425a2ace593e80a8b5df33604699cc8))


### Features

* **infra:** manage duo flow triggers with pulumi and sync custom flows ([c771655](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/c771655a588762163f5edf39a93113f4e84b0c10))
* **infra:** manage gitlab ci settings, the github mirror and firebase storage in code ([11e9def](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/11e9def08b52679fcc6e523107d35ad3ad13b50f))
* **infra:** switch the code review and fix pipeline triggers off ([1389051](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/13890519e527730c957b5359707300c0803b97a8))

# [0.15.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.14.0...v0.15.0) (2026-10-21)


### Bug Fixes

* **ci:** restore the github mirror job and deploy over its ssh key ([aa5bf96](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/aa5bf964d5e8246bf260fcc5a2a71b6174980059))
* **hosting:** skip lifecycle scripts in the app hosting install ([02cadc5](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/02cadc5c1ea3d7d0218edcdece00271785b02e5d))
* **hosting:** use the pnpm config prefix to skip install scripts ([605939a](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/605939abe02772e434f77762f1f19f0918fede27))
* **infra:** let the app hosting account read secret metadata ([85c0528](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/85c0528bffd5821199c32c317822b86fcad6c7fc))
* **infra:** trust each ci account only from its gitlab environment ([14d53ac](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/14d53acaa833c8f7e6cb60ae19c481d1f6f0ed65))


### Features

* **deploy:** upload app hosting source from gitlab ci instead of github ([1980ef8](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/1980ef8599e81228f1069bce695552faed481209))
* **infra:** manage secret values as kms-encrypted pulumi config ([e61b6f9](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/e61b6f92da386a7f17b08c2471b30d0f36d03f08))
* move hosting to firebase, switch to pnpm and add pulumi infra ([86bea32](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/86bea329b5793b30e0a604874fe6b0bdbb055674))

# [0.14.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.13.1...v0.14.0) (2026-10-21)


### Features

* **server:** move sign-in to workos authkit ([c41af55](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/c41af55b552e6df3cf97e43a24df6531ed8c121e))

## [0.13.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.13.0...v0.13.1) (2026-10-21)


### Bug Fixes

* **server:** keep one widgets dir env key after the rebase ([fc58ac3](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/fc58ac3e7c2b11d11aaeaae4ca28a9a17e2c379d))

# [0.13.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.12.2...v0.13.0) (2026-10-21)

### Features

- **server:** serve the step playbooks over mcp and remove the chatgpt plugin ([cc507b4](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/cc507b4fbdae60ad089eb098a41dc7b493e368ab))

## [0.12.2](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.12.1...v0.12.2) (2026-10-20)

### Bug Fixes

- **ads:** remove the ffmpeg caption and brand burn-in ([38f9a6d](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/38f9a6dd174c48b423a6f6c81c182f05091206cf))

## [0.12.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.12.0...v0.12.1) (2026-10-20)

### Bug Fixes

- **web:** record only the error class on mcp spans ([1126644](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/1126644f4055bbf95e6a1ccd3a172a72c89fe67c))

# [0.12.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.11.3...v0.12.0) (2026-10-20)

### Features

- **web:** trace mcp requests to gitlab observability ([3a7a1b3](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/3a7a1b3c28b4d0b4daea5fdd3bcadf4df7f06b3c))

## [0.11.3](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.11.2...v0.11.3) (2026-10-20)

### Bug Fixes

- **web:** show the wovain logo in chatgpt ([ae2b677](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/ae2b6778d23e6919ab09333aa2472446550cfbff))

## [0.11.2](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.11.1...v0.11.2) (2026-10-20)

### Bug Fixes

- **build:** go back to vercel.json so installs honour bun.lock ([ce5d381](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/ce5d38120eeb58503b27fafd1cad5e1f3bb60234))

## [0.11.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.11.0...v0.11.1) (2026-10-20)

### Bug Fixes

- **web:** limit sign-in to listed emails and flag unverified apps ([0eda885](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/0eda8857a70c9788cdc1dcecdde0b99b3299e942))

# [0.11.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.10.0...v0.11.0) (2026-10-20)

### Features

- **web:** sign in through better auth oauth for chatgpt ([14abc7a](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/14abc7a6de923bcc3ebdc6651824ace2225b523b))

# [0.10.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.9.1...v0.10.0) (2026-10-20)

### Features

- **server:** store records in neon and artwork in blob ([4351a76](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/4351a76cc9a0022c56042a914e7fd7dbd34df912))

## [0.9.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.9.0...v0.9.1) (2026-10-20)

### Bug Fixes

- **build:** skip git hooks and skill sync on vercel installs ([bea2507](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/bea25076723f9cb23cbc5a26aef0deb481c50bff))

# [0.9.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.8.2...v0.9.0) (2026-10-20)

### Features

- **web:** host the mcp server on next.js and drop stdio ([c549690](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/c54969035d94020e79098b0a910b82778133fa05))

## [0.8.2](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.8.1...v0.8.2) (2026-10-20)

### Bug Fixes

- **settings:** cache fal prices for 30 minutes ([4f372be](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/4f372beb691703e089201d0170d2f858ffa84dfa))

## [0.8.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.8.0...v0.8.1) (2026-10-19)

### Bug Fixes

- **campaign:** allow only meta https links on the campaign card ([0050a47](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/0050a4795eeff49abe4b21662cfcf395e2c2b0af))

# [0.8.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.7.1...v0.8.0) (2026-10-19)

### Features

- **campaign:** launch advantage+ campaign with automated rules ([f60ff0b](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/f60ff0b013f325fc670c0ca2e3de2a36a8c8b1c2))

## [0.7.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.7.0...v0.7.1) (2026-10-19)

### Bug Fixes

- **ads:** restrict ffmpeg to local files with forced input formats ([6818ffd](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/6818ffd9244eefa09dc1b497859d394f87792739))

# [0.7.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.6.0...v0.7.0) (2026-10-19)

### Features

- **ads:** add ad card with ugc videos, captions and breakeven ([0388662](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/038866241a16704f6d75688cd9be670301d871fa))

# [0.6.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.5.0...v0.6.0) (2026-10-19)

### Features

- **settings:** default the video model to MiniMax H3 Max Reference ([cb353c3](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/cb353c3cd1e88a50c80e552d519829d79fdd633e))

# [0.5.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.4.0...v0.5.0) (2026-10-19)

### Features

- **settings:** add reference-to-video models that keep the print ([291e2bf](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/291e2bfea1494ef4c0687dbe923bfdd5eed2f67f))

# [0.4.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.3.1...v0.4.0) (2026-10-19)

### Features

- **settings:** add cheaper video models and live fal prices ([9cd832f](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/9cd832fad1b41da6c52188a3abcd8162614bc0b0))

## [0.3.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.3.0...v0.3.1) (2026-10-19)

### Bug Fixes

- **server:** tighten artwork download and upload checks ([6ec6c23](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/6ec6c23a12824b4520dac92ffedc1a54932d680f))

# [0.3.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.2.1...v0.3.0) (2026-10-19)

### Features

- **design:** add design card and publish to fourthwall on approve ([b436f53](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/b436f53e059a92d7d61a4f4373c3663cf7e1499c))

## [0.2.1](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.2.0...v0.2.1) (2026-10-19)

### Bug Fixes

- **server:** guard http mode with token and host checks, cap budgets ([bb03605](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/bb03605ba03c1eb7a3741e26eef49bc29cf231f1))

# [0.2.0](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/compare/v0.1.0...v0.2.0) (2026-10-19)

### Features

- **server:** add plugin skeleton, settings store and settings card ([270531c](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/commit/270531cf48c8a0bb49a3f0dbfd16f407f641f59a))
