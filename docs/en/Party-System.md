# Party System Detailed Design

> The Party System is the most gameplay-impactful new system. Players can form adventure parties whose members include NPCs, Ghost NPCs (other player avatars), animals/pets, and even tamed monsters. The party provides assistance in combat, exploration, and social encounters; the GM integrates party capabilities when executing each system.

---

## 1. Party Data Model

### 1.1 PartyMember Type

```typescript
type MemberType = 'npc' | 'ghost_npc' | 'animal' | 'monster';
type MemberRole = 'combat' | 'support' | 'scout' | 'utility';

interface PartyMember {
  /** Unique ID within the party */
  memberId: string;

  /** Member type */
  memberType: MemberType;

  /** Source ID (npcId / ghostNpcId / temporarily generated ID) */
  sourceId: string;

  /** Display name */
  name: string;

  /** Title / type label */
  label: string;

  /** Appearance description */
  appearance: string;

  /** Personality / behavioral traits */
  personality: string;

  /** Role within the party */
  role: MemberRole;

  /** Attributes (STR/DEX/CON/INT/WIS/CHA) */
  attributes: Record<string, number>;

  /** Skill list */
  skills: Array<{
    name: string;
    level: number;
    description: string;
    relatedAttribute: string;
  }>;

  /** Current status */
  status: {
    hp: number;
    maxHp: number;
    isConscious: boolean;
    conditions: string[];
  };

  /** Profession / combat abilities */
  combatAbilities: CombatAbility[];

  /** Utility abilities (non-combat) */
  utilityAbilities: UtilityAbility[];

  /** Join time */
  joinedAt: string;

  /** Reason for joining */
  joinReason: string;

  /** Description of relationship with the player */
  relationshipDescription: string;

  /** Loyalty (0–100; affects whether the member leaves) */
  loyalty: number;

  /** Leave conditions */
  leaveConditions: LeaveCondition[];

  /** Characteristic dialogue / interactions */
  personalityTraits: string[];

  /** Whether the member can level up */
  canLevelUp: boolean;

  /** Party experience points */
  experience: number;
}
```

### 1.2 CombatAbility & UtilityAbility

```typescript
interface CombatAbility {
  name: string;
  type: 'attack' | 'defend' | 'heal' | 'buff' | 'debuff' | 'taunt';
  description: string;
  /** Bonus to the judgment system */
  bonus: {
    type: 'damage_bonus' | 'defense_bonus' | 'skill_bonus' | 'elemental_damage';
    value: number;
    condition?: string;  // Trigger condition description
  };
  /** Cooldown (in combat rounds) */
  cooldown: number;
}

interface UtilityAbility {
  name: string;
  type: 'lockpick' | 'track' | 'negotiate' | 'craft' | 'heal_outside' | 'carry' | 'scout' | 'intimidate' | 'identify' | 'sneak';
  description: string;
  /** Ability level 1–10 */
  level: number;
  /** Bonus to the judgment system */
  bonus: number;
}
```

### 1.3 LeaveCondition

```typescript
interface LeaveCondition {
  type: 'loyalty_below' | 'goal_conflict' | 'player_reputation' | 'region_leave' | 'time_limit' | 'injury';
  threshold: number | string;
  description: string;
}
```

---

## 2. Party Store (State Management)

```typescript
interface PartyState {
  /** List of party members */
  members: PartyMember[];

  /** Maximum party size (default 4) */
  maxSize: number;

  /** Party name */
  name: string;

  /** Total party carry capacity */
  totalCarryCapacity: number;

  // --- Operations ---
  addMember: (member: PartyMember) => boolean;
  removeMember: (memberId: string) => void;
  updateMemberStatus: (memberId: string, status: Partial<PartyMember['status']>) => void;
  updateMemberLoyalty: (memberId: string, delta: number) => void;
  levelUpMember: (memberId: string) => void;

  // --- Queries ---
  getCombatBonus: () => PartyCombatBonus;
  getUtilityAssist: (abilityType: string) => PartyUtilityAssist | null;
  isMemberCapable: (memberId: string, abilityType: string) => boolean;
  canRecruit: () => boolean;
}

interface PartyCombatBonus {
  totalDamageBonus: number;
  totalDefenseBonus: number;
  totalSkillBonus: number;
  memberActions: PartyCombatAction[];
}

interface PartyCombatAction {
  memberId: string;
  memberName: string;
  abilityName: string;
  effect: string;
}

interface PartyUtilityAssist {
  memberId: string;
  memberName: string;
  abilityLevel: number;
  bonus: number;
  narrative: string;  // Narrative text generated for the GM
}
```

---

## 3. Recruitment System

### 3.1 NPC Recruitment Conditions

The GM returns recruitment results through the `consequences` structure. The client checks conditions before executing:

```typescript
interface RecruitCheck {
  /** Target ID */
  targetId: string;

  /** Target type */
  targetType: MemberType;

  /** Check conditions */
  conditions: RecruitCondition[];

  /** Recruitment result when all conditions are met */
  onSuccess: PartyMember;

  /** Narrative when conditions are partially met */
  partialNarrative: string;
}

interface RecruitCondition {
  type: 'relationship_level' | 'attitude' | 'reputation' | 'goal_match' | 'past_experience' | 'combat_victory' | 'skill_check';
  /** Condition value */
  value: number | string;
  /** Whether met */
  met: boolean;
  /** Human-readable description */
  description: string;
}
```

### 3.2 Recruitment Paths by Member Type

| Member Type | Recruitment Path | Conditions |
|---------|---------|------|
| **NPC (good relationship)** | GM proposes in narrative after favorability threshold met | Favor ≥ 50 + aligned goals + no reputation conflict |
| **NPC (mercenary)** | Guild posts mercenary commission | Pay gold + base favor 10 |
| **Ghost NPC** | Special encounter event; mutual agreement | Complete one interaction + friendly attitude |
| **Animal** | Taming check (WIS judgment) | Successful check + has food |
| **Monster (post-defeat)** | CHA persuasion after defeat | Defeated + successful CHA check + reputation violence value under threshold |

### 3.3 Recruitment Flow

```
Player action → GM evaluation → Narrative includes recruitment hint
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            consequences.recruit = {       GM narrative hints at recruitment
              targetId,                    Player actively enters "[Recruit {name}]"
              targetType,                          │
              conditions,                           ▼
              memberData                    Client checks conditions
            }                                      │
            Client auto-checks conditions   ┌──────┴──────┐
            → All met: auto-join            │ Met  │ Not Met
            → Not met: GM narrative states why  ▼       ▼
                                              Join    GM states reason
```

---

## 4. Party Role in Core Systems

### 4.1 Combat System Integration

`JudgmentSystem.evaluate()` when computing judgment:

```typescript
function getPartyCombatBonus(context: ActionContext, party: PartyState): PartyCombatBonus {
  const bonus: PartyCombatBonus = {
    totalDamageBonus: 0,
    totalDefenseBonus: 0,
    totalSkillBonus: 0,
    memberActions: [],
  };

  for (const member of party.members) {
    if (!member.status.isConscious) continue;

    for (const ability of member.combatAbilities) {
      const relevant = isRelevantToAction(ability, context);
      if (!relevant) continue;

      switch (ability.bonus.type) {
        case 'damage_bonus':
          bonus.totalDamageBonus += ability.bonus.value;
          break;
        case 'defense_bonus':
          bonus.totalDefenseBonus += ability.bonus.value;
          break;
        case 'skill_bonus':
          bonus.totalSkillBonus += ability.bonus.value;
          break;
      }

      bonus.memberActions.push({
        memberId: member.memberId,
        memberName: member.name,
        abilityName: ability.name,
        effect: `${member.name} uses [${ability.name}]: ${ability.description} (+${ability.bonus.value})`,
      });
    }
  }

  return bonus;
}
```

Party contribution is injected into the judgment result:

```
Judgment Result: Success
  2d6: [3,4] +2(Attr) +1(Skill) +3(Equip) = 13 vs DC5
  [Party]
  Eileen uses [Precision Strike]: Focused attack on weak point (+2)
  Brock uses [Shield Wall]: Block one attack (+1 Defense)
  → Final: 15 vs DC5 → Critical Success
```

### 4.2 Exploration System Integration

Party ability hints are injected in `PromptBuilder`:

```
[Available Party Abilities]
- Eileen (Stalker): Lockpick Lv.4 — can attempt to unlock doors
- Greyclaw (Hound): Tracking Lv.5 — can follow scent trails
- Brock (Warrior): Carry +50 kg — can carry more items
```

When the GM generates options, if the scene involves locked doors / tracking / stealth, the GM considers generating options such as "Have Eileen pick the lock".

### 4.3 Social System Integration

```
[Party Social Specialists]
- Grom (Dwarf Merchant): Negotiation Lv.3 — may obtain better prices when trading
- Hecate (Warlock): Intimidate Lv.4 — can use magic to intimidate unfriendly NPCs
```

### 4.4 Prompt Injection Structure

On every GM invocation, `buildCharacterLayer` or a new method `buildPartyLayer` injects:

```
[Current Adventure Party]
Member 1/4: Eileen Ash (Mercenary)
  HP: 18/22 | Loyalty: 85/100
  Combat: Precision Strike (+2 Dmg), Evasive Footwork (+1 Def)
  Utility: Lockpick Lv.4, Scout Lv.3
Member 2/4: Greyclaw (Hound)
  HP: 12/12 | Loyalty: 95/100
  Combat: Bite (+1 Dmg)
  Utility: Tracking Lv.5, Vigilance Lv.3
Member 3/4: Brock Ironfist (Dwarf Warrior)
  HP: 30/35 | Loyalty: 70/100
  Combat: Shield Wall (+2 Def), Armorbreaker Smash (+3 Dmg)
  Utility: Carry +50 kg

The party automatically assists in combat. Outside combat, check available utility abilities:
- If facing a locked door and a member can lockpick → hint "a party member can help"
- If facing a complex negotiation and a member can negotiate → hint "a party member can negotiate on your behalf"
```

---

## 5. UI Design

### 5.1 Layout

A "Party" tab is added to the left sidebar, alongside Character and Social:

```
┌─────────────────┐
│ [Character] [Social] [Party] │  ← Tab switching
├─────────────────┤
│ 🛡 Adventure Party (3/4) │
│                     │
│ ┌─────────────────┐ │
│ │ 🧑 Eileen       │ │  ← Member card (expandable)
│ │ Mercenary | HP 18/22│ │
│ │ Loyalty ████░ 85│ │
│ │ [View Details]  │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ 🐕 Greyclaw     │ │
│ │ Hound | HP 12/12│ │
│ │ Loyalty █████ 95│ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ ⚔ Brock        │ │
│ │ Warrior | HP 30/35│ │
│ │ Loyalty ███░░ 70│ │
│ └─────────────────┘ │
│                     │
│ [Party Ability Overview] │
│ ⚔ Dmg+3  🛡 Def+3 │
│ 🔓 Lockpick  🐾 Track │
│ ⚖ Carry +50 kg     │
└─────────────────┘
```

### 5.2 Member Detail Popup

Click a member → detail card pops up:

```
┌──────────────────────────────────────┐
│ 🧑 Eileen Ash               [✕]     │
│ Mercenary · Joined on World Day 47   │
│──────────────────────────────────────│
│ HP: █████████░ 18/22                 │
│ Loyalty: ████████░ 85/100            │
│ Status: Right hand burn 🔥           │
│──────────────────────────────────────│
│ Attributes: STR14 DEX16 CON12 INT10  │
│             WIS15 CHA12              │
│──────────────────────────────────────│
│ Combat Abilities:                     │
│  ⚔ Precision Strike: +2 Dmg (weak point attack) │
│  🏃 Evasive Footwork: +1 Def (quick dodge)     │
│──────────────────────────────────────│
│ Utility Abilities:                    │
│  🔓 Lockpick Lv.4                     │
│  👁 Scout Lv.3                        │
│──────────────────────────────────────│
│ Joined because: After helping her    │
│ fend off guards in Ironforge City,   │
│ she decided to travel with you.      │
│                                      │
│ [Dismiss Member] (unavailable when Loyalty ≥ 80) │
└──────────────────────────────────────┘
```

### 5.3 Party Ability Overview

Fixed area at the bottom for quickly viewing the party's overall abilities:

```
┌─────────────┐
│ ⚔ Dmg +3    │
│ 🛡 Def +3    │
│ 🔓 Lockpick Lv.4 │
│ 🐾 Track Lv.5    │
│ 💬 Negotiate Lv.3 │
│ ⚖ Carry +50 │
└─────────────┘
```

---

## 6. GM Interaction Interface

### 6.1 Consequences Extension

```typescript
interface ConsequenceData {
  // ... existing fields ...

  /** Party-related */
  recruit?: {
    targetId: string;
    targetType: MemberType;
    targetName: string;
    memberData: PartyMember;
    conditions: Array<{
      type: string;
      description: string;
      met: boolean;
    }>;
    narrative: string;  // Narrative for the recruitment scene
  };
  partyMemberUpdate?: {
    memberId: string;
    hpChange?: number;
    loyaltyChange?: number;
    conditionsAdded?: string[];
    conditionsRemoved?: string[];
    learnedAbility?: CombatAbility | UtilityAbility;
  };
  partyMemberLeave?: {
    memberId: string;
    reason: string;
    narrative: string;
  };
}
```

### 6.2 GM Influences Party via Narrative

The GM inserts party action descriptions into the returned narrative:

```
Normal narrative:
"You push open the basement door..."

With a party:
"Brock raises his shield before you, pushing open the heavy iron basement door. Eileen quickly scans the dark space..."
```

The GM needs no special fields — simply naturally mentioning party members in the narrative. The `NPCIntroduced` mechanism applies equally to new member introductions.

### 6.3 Party Judgment Intervention

`JudgmentSystem.evaluate()` reads `PartyStore`:

```typescript
// Automatically calculate party bonus during judgment
const partyBonus = usePartyStore.getState().getCombatBonus();
const totalEquipmentBonus = effectResult.totalEquipmentBonus + partyBonus.totalDamageBonus + partyBonus.totalDefenseBonus;
```

---

## 7. Loyalty System

### 7.1 Loyalty Changes

| Event | Change |
|------|------|
| Combat victory | +3 |
| Severe injury in combat | -5 |
| Player helps a member | +10 |
| Player ignores a member's request | -8 |
| Player acts against a member's values | -15 |
| Give equipment / items to a member | +5 |
| Prolonged inactivity | -2/day |
| Member is revived | +20 |

### 7.2 Loyalty Thresholds

| Loyalty | Behavior |
|--------|------|
| ≥ 80 | Will not leave; unlocks exclusive dialogue |
| 50–79 | Normal state |
| 20–49 | May refuse dangerous orders |
| 10–19 | May leave the party |
| < 10 | Will definitely leave |

---

## 8. Party Member Type Templates

### 8.1 NPC Party Member (based on existing NPC)

```typescript
function createNPCAsMember(npc: GameNPC): PartyMember {
  const abilities = inferAbilitiesFromNPC(npc);
  return {
    memberType: 'npc',
    sourceId: npc.npcId,
    name: npc.name,
    label: npc.title || 'Adventurer',
    appearance: npc.appearance,
    personality: npc.personality,
    role: inferRole(npc),
    attributes: { ...npc.attributes },
    skills: npc.skills.map(s => ({ ...s })),
    status: { hp: 20, maxHp: 20, isConscious: true, conditions: [] },
    combatAbilities: abilities.combat,
    utilityAbilities: abilities.utility,
    joinedAt: new Date().toISOString(),
    joinReason: 'Joined based on trust and shared goals',
    relationshipDescription: `${RELATIONSHIP_LABELS[npc.relationship.level]} (Favor ${npc.relationship.attitude})`,
    loyalty: 50,
    leaveConditions: [],
    personalityTraits: npc.personality.split(/[,，、]/),
    canLevelUp: npc.canGrow,
    experience: 0,
  };
}
```

Ability inference rules:

| NPC Skill Keyword | Combat Ability | Utility Ability |
|--------------|---------|---------|
| Sword / Blade / Axe / Bow | Dmg + level/2 | — |
| Shield / Defense | Def + level/2 | — |
| Sorcery / Magic | Elemental Dmg + level | — |
| Healing / Medicine | Restore HP | Heal Lv.level |
| Lockpick / Stealth | — | Lockpick / Sneak Lv.level |
| Negotiation / Rhetoric | — | Negotiate Lv.level |
| Tracking / Hunting | — | Track Lv.level |
| Smithing / Crafting | — | Craft Lv.level |

### 8.2 Animal Member Templates

```typescript
const ANIMAL_TEMPLATES: Record<string, Partial<PartyMember>> = {
  'Hound': {
    memberType: 'animal',
    label: 'Hound',
    attributes: { STR: 12, DEX: 15, CON: 10, INT: 4, WIS: 14, CHA: 6 },
    combatAbilities: [{ name: 'Bite', type: 'attack', description: 'Bite the enemy with sharp fangs', bonus: { type: 'damage_bonus', value: 1 }, cooldown: 1 }],
    utilityAbilities: [
      { name: 'Track', type: 'track', description: 'Follow scent trails', level: 5, bonus: 5 },
      { name: 'Vigilance', type: 'scout', description: 'Guard the camp while resting', level: 3, bonus: 3 },
    ],
    role: 'scout',
    canLevelUp: false,
    loyalty: 70,
  },
  'Warhorse': {
    memberType: 'animal',
    label: 'Warhorse',
    attributes: { STR: 18, DEX: 10, CON: 16, INT: 3, WIS: 8, CHA: 8 },
    combatAbilities: [{ name: 'Trample', type: 'attack', description: 'Charge and trample enemies', bonus: { type: 'damage_bonus', value: 2 }, cooldown: 2 }],
    utilityAbilities: [
      { name: 'Carry', type: 'carry', description: 'Increase travel carrying capacity', level: 4, bonus: 4 },
    ],
    role: 'utility',
    canLevelUp: false,
    loyalty: 60,
  },
  'Falcon': {
    memberType: 'animal',
    label: 'Falcon',
    attributes: { STR: 4, DEX: 18, CON: 6, INT: 6, WIS: 16, CHA: 8 },
    combatAbilities: [{ name: 'Dive', type: 'attack', description: 'Swoop down from the sky to attack', bonus: { type: 'damage_bonus', value: 1 }, cooldown: 2 }],
    utilityAbilities: [
      { name: 'Scout', type: 'scout', description: 'Scout the area ahead from the air', level: 6, bonus: 6 },
    ],
    role: 'scout',
    canLevelUp: false,
    loyalty: 65,
  },
};
```

### 8.3 Monster Member Templates (tamed after defeat)

```typescript
const MONSTER_TEMPLATES: Record<string, Partial<PartyMember>> = {
  'Young Slime': {
    memberType: 'monster',
    label: 'Young Slime',
    attributes: { STR: 4, DEX: 4, CON: 16, INT: 2, WIS: 2, CHA: 2 },
    combatAbilities: [{ name: 'Acid Splash', type: 'debuff', description: 'Weaken enemy armor', bonus: { type: 'damage_bonus', value: 0, condition: 'Reduce enemy defense by 1' }, cooldown: 3 }],
    utilityAbilities: [{ name: 'Dissolve', type: 'utility' as any, description: 'Can dissolve simple obstacles', level: 2, bonus: 2 }],
    role: 'utility',
    canLevelUp: true,
    loyalty: 40,
  },
  'Wolf Pup': {
    memberType: 'monster',
    label: 'Wolf Pup',
    attributes: { STR: 10, DEX: 14, CON: 8, INT: 5, WIS: 12, CHA: 6 },
    combatAbilities: [{ name: 'Pack Bite', type: 'attack', description: 'Coordinate attack with the master', bonus: { type: 'damage_bonus', value: 2 }, cooldown: 1 }],
    utilityAbilities: [{ name: 'Track', type: 'track', description: 'Track prey', level: 4, bonus: 4 }],
    role: 'combat',
    canLevelUp: true,
    loyalty: 30,  // Low initial loyalty
  },
};
```

---

## 9. API & Server Side

### 9.1 Consequences Transmission

The JSON returned by the GM already includes `recruit` / `partyMemberUpdate` / `partyMemberLeave` fields. The server does not need to store additional party data (the party is a client-side local concept), but NPC relationship changes are uploaded.

### 9.2 Optional: Server-Side Party Snapshot

```sql
-- Optional: store the player's party snapshot on the server
ALTER TABLE characters ADD COLUMN party_snapshot TEXT DEFAULT '{}';
-- JSON: { members: [...], updatedAt: "..." }
```

The client uploads periodically (synced with chronicle uploads) for:
- Other players seeing via Ghost NPCs that "this person has an adventure party"
- Data loss prevention

---

## 10. Implementation Task Checklist

### Phase 1: Data Model + Store (1 day)

- [ ] P1.1 Define `PartyMember` / `CombatAbility` / `UtilityAbility` / `LeaveCondition` types (`types/party.ts`)
- [ ] P1.2 Define `PartyState` Zustand store (`stores/partyStore.ts`): members / maxSize / addMember / removeMember / getCombatBonus / getUtilityAssist
- [ ] P1.3 Define `ANIMAL_TEMPLATES` / `MONSTER_TEMPLATES` constants (`services/party/PartyTemplates.ts`)
- [ ] P1.4 Define `inferAbilitiesFromNPC()` inference function

### Phase 2: Judgment Integration (1 day)

- [ ] P2.1 `JudgmentSystem.evaluate()` reads `PartyStore.getCombatBonus()`
- [ ] P2.2 `calculateDiceResult()` includes party contribution fields in results
- [ ] P2.3 `PromptBuilder.buildPartyLayer()` — inject party information into the Prompt
- [ ] P2.4 Handle recruit / partyMemberUpdate / partyMemberLeave in GM-returned `consequences`
- [ ] P2.5 Inject available party ability hints into the GM Prompt ("if the scene has a locked door, hint that a member can pick it")

### Phase 3: Recruitment System (1 day)

- [ ] P3.1 `PartyRecruitChecker` — check recruitment conditions for NPCs / Ghost NPCs / animals / monsters
- [ ] P3.2 GM `consequences.recruit` processing flow — auto-join when all conditions met / state reason when not met
- [ ] P3.3 Loyalty system — event-driven loyalty changes
- [ ] P3.4 `LeaveCheck` — check leave conditions every round

### Phase 4: UI (1.5 days)

- [ ] P4.1 Add "Party" tab to left sidebar (`PartyPanel.tsx`)
- [ ] P4.2 Member list cards (avatar / name / HP bar / loyalty bar / status tags)
- [ ] P4.3 Member detail popup (attributes / combat abilities / utility abilities / join reason / dismiss button)
- [ ] P4.4 Party ability overview (fixed bottom area: damage / defense / available utility summary)
- [ ] P4.5 `LeftPanel.tsx` tab switching adds "Party" (Character / Social / Party)

### Phase 5: Advanced Features (1 day)

- [ ] P5.1 Member experience & leveling (members with canLevelUp=true accumulate XP through combat)
- [ ] P5.2 Animal / monster taming check UI (WIS or CHA dice judgment)
- [ ] P5.3 Special Ghost NPC join logic (mutual consent + friendly attitude)
- [ ] P5.4 Server-side party snapshot storage (`characters.party_snapshot` JSON)
- [ ] P5.5 Party carry weight calculation (affects travel speed)

---

## 11. Roadmap

The goal is to fully connect the party data model with the state management layer, seamlessly injecting each member's combat abilities and utility skills into the judgment system, so that party contributions are visible and tangible in every dice roll. The GM will naturally mention member actions in the narrative, and the Prompt layer will intelligently sense scenario needs and proactively suggest available member abilities.

The recruitment system is expected to become part of the world narrative — players recruit companions through diverse paths such as favor accumulation, guild mercenary contracts, special encounters, or post-defeat taming, each path carrying its own distinct narrative atmosphere and check challenges. Loyalty rises and falls with the adventure, truly affecting members' decisions to stay or leave.

The aspiration is to build an intuitive and rich party management interface: member cards show loyalty and status at a glance, detail popups display deep character data, and the ability overview constantly reminds the player of the party's overall combat strength and utility potential.

The party system is expected to evolve further — members gain experience and grow through adventures, animals and monsters join the party through dedicated taming checks, and Ghost NPCs have a special mutual-consent join mechanism. Server-side snapshots ensure party data is never lost, and the carry-weight system influences travel pace and strategic choices, making every expedition a balance of manpower and supplies.
