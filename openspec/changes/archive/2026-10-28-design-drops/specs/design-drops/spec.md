# Spec Delta

## ADDED Requirements

### Requirement: Drops chosen by taste

With the `design-drops` flag on, a merchant SHALL be able to plan a drop from an idea: 4 to 6 products that share one palette and one set of art. Code SHALL choose a style family from the Qloo tags of the idea's run and the brand's niches, and the product mix from the family. The choice and the tags behind it SHALL be saved in the decision trace with the Qloo tags as sources and shown on the drop.

#### Scenario: Skate tags

- **WHEN** the run's Qloo tags include "Skate punk" and "Grunge revival"
- **THEN** the drop's style family is skate and punk, its products are a heavyweight tee, a long-sleeve tee, a beanie and a sticker, and the page names the two tags

#### Scenario: No matching tag

- **WHEN** no tag matches a style family
- **THEN** the drop uses streetwear and says so

#### Scenario: Flag off

- **WHEN** the flag is off for the merchant
- **THEN** the drops procedures answer 404 and the page and sidebar item don't exist

### Requirement: Placement plan per product

Each product SHALL carry a placement plan resolved against its blank's print areas: the hero tee or hoodie a large back graphic set high plus a left-chest mark and a neck label, long sleeves a chest mark plus sleeve text, hats and crewnecks an embroidered mark. A plan SHALL NOT use both sizes of one area, and SHALL cover every required area.

#### Scenario: Hero tee

- **WHEN** a tee offers `front` with a `leftChest` placement, `back_large` and `neck_label`
- **THEN** the graphic goes on `back_large` at offset y -0.18, the mark on `front` at `leftChest` and the label on `neck_label`

### Requirement: Art per art type

Each art type SHALL be drawn by the model suited to it, with model IDs set per environment (`FAL_IMAGE_MODEL`, `FAL_ART_MODELS`), once per drop. Code SHALL finish each placement as a PNG at the region's pixels with hard alpha edges: SVG rasterized, embroidery limited to 6 colors, patterns tiled, raster art without transparency cut out, and raster art below the method's DPI upscaled.

#### Scenario: Shared art

- **WHEN** a drop's products are built
- **THEN** the graphic, the mark and the sleeve type are each drawn once, and the embroidery reuses the mark

#### Scenario: Opaque raster

- **WHEN** a raster graphic comes back without an alpha channel
- **THEN** the background remover runs once before the art is placed

### Requirement: Composition and placement checks

Code SHALL record facts for every placement: DPI at print size, aspect against the region, transparency, whether the art is a solid rectangle, and thread colors on embroidery. Nemotron's vision model SHALL check one mockup per product for placement fit and hierarchy, and the drop for cohesion. A product the vision model doesn't answer for SHALL fail its checks. The page SHALL show every failed check.

#### Scenario: Square image on a shirt

- **WHEN** a back graphic fills more than 90% of its bounding box
- **THEN** its slab check fails and the page shows it

### Requirement: Mockups and price

Each product SHALL be previewed once with all its placements, colors and sizes, and the page SHALL show every mockup. Its price SHALL come from Fourthwall's cost to make that customization, at its costliest size, through the pricing rules, in integer cents. When that cost can't be read, the failure SHALL be logged at error level and the price SHALL use the blank's catalog price plus each extra area's price, and the page SHALL say which source it used.

#### Scenario: Cost-based price

- **WHEN** Fourthwall's pricing says the customization costs $21.40 in M and $22.90 in L
- **THEN** the product is priced from $22.90

### Requirement: Publishing a drop

Publishing a drop SHALL be one `store.drop.publish` approval. Once it is approved, the products SHALL be created at their prices, a Fourthwall collection SHALL be created with them, and the collection and its products SHALL be made public. Each write SHALL be keyed so a retry publishes once, and the approval SHALL record executing, then done or failed.

#### Scenario: Approved publish

- **WHEN** the merchant publishes a drop whose products are ready
- **THEN** after approval the drop is live and the page shows its collection
