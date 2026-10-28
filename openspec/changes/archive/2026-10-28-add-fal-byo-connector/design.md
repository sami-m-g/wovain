# Design

fal uses the same OAuth connection flow as Fourthwall (client metadata URL, sealed grant). A separate API-key connection was dropped: the grant already bills the merchant's fal account, and a pasted key would add a second secret to seal, validate and rotate.
