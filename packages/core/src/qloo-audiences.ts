// Qloo audiences (urn:audience:…) an apparel brand can sell to, each with the
// words wovain searches Meta's interests for.
//
// The audience IDs and names come from ResonanceAI's list of Qloo audiences
// (resonance_agent/political_agent/qlootools.py, AVAILABLE_AUDIENCES),
// Apache License 2.0: https://github.com/hazardscarn/ResonanceAI
// Changes: kept the audiences an apparel brand can advertise to; left out
// communities, global issues, politics, beliefs, investing and professions,
// which Meta treats as sensitive or which no shirt sells to; added the Meta
// interest search words.

export interface QlooAudience {
  id: string;
  // What Meta's interest search is asked for: Meta's own wording where
  // Qloo's differs ("Video Gamer" is "Video games" on Meta).
  metaQuery: string;
  name: string;
}

const audience = (id: string, name: string, metaQuery = name) => ({
  id: `urn:audience:${id}`,
  metaQuery,
  name,
});

export const QLOO_AUDIENCES: readonly QlooAudience[] = [
  audience("hobbies_and_interests:street_fashion", "Street Fashion"),
  audience("hobbies_and_interests:high_fashion", "High Fashion"),
  audience("hobbies_and_interests:sneakerheads", "Sneakerheads", "Sneakers"),
  audience(
    "spending_habits:vintage_apparel",
    "Vintage Apparel",
    "Vintage clothing"
  ),
  audience(
    "spending_habits:discount_shoppers",
    "Discount Shoppers",
    "Discount stores"
  ),
  audience("hobbies_and_interests:jewellery", "Jewellery", "Jewelry"),
  audience(
    "hobbies_and_interests:health_and_beauty",
    "Health And Beauty",
    "Beauty"
  ),
  audience("hobbies_and_interests:photography", "Photography"),
  audience("hobbies_and_interests:video_gamer", "Video Gamer", "Video games"),
  audience("hobbies_and_interests:musician", "Musician", "Musical instruments"),
  audience("hobbies_and_interests:dance", "Dance"),
  audience("hobbies_and_interests:running", "Running"),
  audience("hobbies_and_interests:hiking", "Hiking"),
  audience("hobbies_and_interests:outdoors", "Outdoors", "Outdoor recreation"),
  audience("hobbies_and_interests:travel", "Travel"),
  audience("hobbies_and_interests:yoga", "Yoga"),
  audience("hobbies_and_interests:basketball", "Basketball"),
  audience(
    "hobbies_and_interests:soccer",
    "Soccer",
    "Association football (Soccer)"
  ),
  audience(
    "hobbies_and_interests:adrenaline_rushers",
    "Adrenaline Rushers",
    "Extreme sports"
  ),
  audience("leisure:arts_culture", "Arts Culture", "Arts and music"),
  audience("leisure:music_festivals", "Music Festivals", "Music festivals"),
  audience("leisure:cinephile", "Cinephile", "Movies"),
  audience("leisure:avid_reader", "Avid Reader", "Reading"),
  audience("leisure:coffee", "Coffee"),
  audience("leisure:foodie", "Foodie", "Food"),
  audience(
    "investing_interests:art_collectibles",
    "Art Collectibles",
    "Collectables"
  ),
  audience(
    "professional_area:advertising_design",
    "Advertising Design",
    "Graphic design"
  ),
];
