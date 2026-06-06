# Storybook Schema Reference

> The StoryBook is the data core of the OpenTaleRunner world. Swap out `storybook.json` for a completely different world without changing any code.

## 1. Top-Level Structure

```json
{
  "version": 1,
  "world_name": "World Name",
  "current_era": "Current era description",
  "world_lore": { ... },
  "main_quest": { ... },
  "regions": [ ... ],
  "milestones": [ ... ],
  "location_types": { ... },
  "starting_context": { ... },
  "narrative_guide": { ... },
  "npc_role_templates": [ ... ],
  "terrain_seeds": [ ... ],
  "prompt_overrides": [ ... ],
  "water_seeds": [ ... ],
  "road_seeds": [ ... ]
}
```

## 2. world_lore (Worldbuilding)

```json
{
  "geography": "Geography description text",
  "history_summary": "Historical timeline summary",
  "races": "Race descriptions",
  "magic_system": {
    "description": "Magic system description",
    "rules": ["Rule 1", "Rule 2"]
  },
  "deities_and_religion": {
    "description": "Deities and religion description",
    "note": "Additional notes"
  },
  "worldspine_tower": "Worldspine Tower description"
}
```

## 3. regions

Each region contains sub-regions, factions, key NPCs, dungeons, and dynamic events:

```json
{
  "id": "region_id",
  "name": "Region display name",
  "full_name": "Full name",
  "description": "Region description",
  "terrain": "Terrain type",
  "weather_patterns": ["Weather 1", "Weather 2"],
  "sub_regions": [
    {"name": "Sub-region name", "type": "Type", "description": "Description"}
  ],
  "factions": [
    {"name": "Faction name", "attitude": 50, "description": "Description"}
  ],
  "key_npcs": [
    {"name": "NPC name", "role": "Role", "personality": "Personality description"}
  ],
  "dungeons": [
    {"name": "Dungeon name", "level": "novice/intermediate/advanced", "description": "Description"}
  ],
  "dynamic_events": [
    {"trigger": "random/milestone:beat_id", "event": "Event description"}
  ]
}
```

### Sub-region Types (location_types)

```json
{
  "capital": {
    "label": "Capital",
    "subtypes": [
      {"id": "city_square", "label": "City Square", "icon": "🏛", "can_be_birthplace": true}
    ]
  }
}
```

## 4. main_quest

```json
{
  "premise": "Story premise",
  "current_chapter": {
    "id": "ch_01",
    "name": "Chapter name",
    "summary": "Chapter summary",
    "world_day_range": [1, 100]
  },
  "beats": [
    {
      "id": "beat_01_01",
      "name": "Beat name",
      "status": "pending/locked",
      "depends_on": "beat_id or null",
      "unlock_condition": "Unlock condition description",
      "narrative_when_unlocked": "Narrative triggered upon unlock"
    }
  ],
  "milestones_for_next_chapter": "Conditions to advance to next chapter"
}
```

## 5. milestones

```json
{
  "id": "M0",
  "name": "Milestone name",
  "status": "locked/pending/active/completed",
  "description": "Description",
  "trigger_condition": "Trigger condition"
}
```

## 6. narrative_guide (Narrative Style Guide)

```json
{
  "point_of_view": "Use second-person 'you' to address the player",
  "tone": "Epic but not pretentious; humor is acceptable but not frivolous",
  "scene_length": "2–4 sentences to sketch the environment for scene descriptions",
  "choice_rules": [
    "Choices should be distinct (combat/social/exploration/opportunistic/evasion)",
    "Choices should advance the story"
  ],
  "forbidden": [
    "Never make decisions for the player",
    "Never break the fourth wall"
  ],
  "consistency_checks": [
    "Check item status (consumed/damaged)",
    "Check NPC life/death status"
  ]
}
```

## 7. npc_role_templates

```json
{
  "key": "merchant",
  "name": "Merchant",
  "attributes": {"STR": 10, "DEX": 12, "CON": 10, "INT": 13, "WIS": 12, "CHA": 14},
  "skills": [
    {"name": "Appraisal", "level": 3, "description": "Accurately assess item value", "attribute": "INT"}
  ],
  "services": ["Buy/sell items", "Identification"]
}
```

### behavior_configs

```json
{
  "behavior_type": "rule",
  "npc_role": "merchant",
  "actions": {
    "morning": "Arranging shelves at {location}, preparing to open",
    "afternoon": "Soliciting customers at {location}"
  }
}
```

## 8. starting_context

```json
{
  "region_id": "royal_plains",
  "sub_region": "Radiant City",
  "birth_locations": [
    {"name": "Wheatfield Village", "type": "village", "description": "Agricultural village", "can_be_birthplace": true, "coordinates": {"x": -120, "z": 80}}
  ]
}
```

## 9. terrain_seeds

```json
{
  "region": "royal_plains",
  "x_min": -200, "x_max": 200,
  "y_min": -200, "y_max": 200,
  "z_min": -200, "z_max": 200,
  "terrain_type": "plains",
  "description": "Vast plains"
}
```

## 10. water_seeds / road_seeds

```json
{
  "id": "ocean_west",
  "type": "ocean",
  "name": "Endless Ocean",
  "region": "",
  "path": [[-800, -600], [-800, 600]]
}
```

```json
{
  "id": "road_king",
  "name": "King's Road",
  "region": "royal_plains",
  "from": "Radiant City",
  "to": "Ancient Crossing",
  "path": [[0, 0], [30, 5]],
  "type": "major"
}
```

## 11. prompt_overrides

```json
{
  "slot": "narrative_guide",
  "scope": "regional",
  "target_ids": ["royal_plains"],
  "mode": "append",
  "content": "- Narration in the Royal Plains should have a courtly feel",
  "comment": "Royal Plains exclusive style"
}
```

### Available Placeholder Variables

| Placeholder | Meaning |
|---|---|
| `{{characterName}}` | Character name |
| `{{characterRace}}` | Race |
| `{{currentRegion}}` | Current region |
| `{{currentSubRegion}}` | Current sub-region |
| `{{worldDay}}` | World day |
| `{{currentEra}}` | Current era |
| `{{worldName}}` | World name |
| `{{hp}}` / `{{maxHp}}` | HP |
| `{{timeOfDay}}` | Time of day |
| `{{weather}}` | Weather |
| `{{terrain}}` | Terrain |
| `{{lightLevel}}` | Light level |

---

## Storybook Replacement Guide

1. Copy `storybook.json` and save as a new file
2. Modify `world_name`, `current_era`, `world_lore` to the new world setting
3. Modify `regions` as needed (add or remove regions; keep at least 1 region containing the area referenced in `starting_context.region_id`)
4. Modify `main_quest.beats` to the main storyline beats
5. Modify `milestones` to key milestones
6. Modify `narrative_guide` to a narrative style fitting the new world
7. Modify `terrain_seeds`, `water_seeds`, `road_seeds` to matching terrain data
8. Optional: add `prompt_overrides` to customize narrative style per region
9. Replace the server `data/storybook.json` and point the `STORYBOOK_PATH` environment variable accordingly
10. Restart the server; clients will automatically pull the new storybook

---

## 12. Roadmap

We aim to establish a version management system for storybooks, supporting schema versioning with automatic migration so that older storybooks can smoothly upgrade to new formats. A multi-world switching interface will allow players to freely traverse between different worlds, while we explore the possibility of a community storybook marketplace, building an open content ecosystem of player co-creation.

We plan to further develop dynamic storybook capabilities — player actions will truly change the world, unlocking new regions and quest lines on demand, letting the world evolve continuously through player choices. A companion graphical storybook editor will dramatically lower the creation barrier, enabling non-technical creators to easily build their own fantasy worlds. We will also explore i18n multilingual storybook support to bring Aeslan to players worldwide.

The long-term vision is to deeply integrate procedural world generation with AI-assisted authoring, letting large language models help creators conceive worldbuilding, write region descriptions, and design quest lines — pioneering a new paradigm of human-AI collaborative storybook creation.
