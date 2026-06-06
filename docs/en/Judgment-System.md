# Judgment System

## 1. Introduction

The Judgment System is OpenTaleRunner's core resolution mechanism, responsible for adjudicating the outcomes of all character actions in the game world. The system uses a 2d6 dice pool, comparing dice results against a Difficulty Level (LC) after applying multi-source modifiers, mapping each action to one of five graded outcome tiers.

**Why 2d6?** 2d6 produces a bell-shaped distribution from 2 to 12, with a peak at 7. Compared to d20's uniform distribution, this better reflects reality — most attempts cluster around average performance, with extreme successes and extreme failures being rarer. This provides a more natural probability foundation for narrative-driven adjudication.

**Core Concepts:**

- **Absurdity Level**: The GM's subjective assessment of action difficulty, ranging from 1 to 10. Higher values indicate more absurd/difficult actions.
- **Difficulty Level (difficultyLC)**: A fixed value from 2 to 16, derived from absurdity via the `absurdityToLC` mapping table, representing the threshold the action must meet.
- **Outcome Tiers**: The judgment result is classified into five tiers: `critical_success`, `success`, `partial_success`, `failure`, `critical_failure`. Different tiers trigger different narrative and numerical consequences.

When absurdity ≤ 2, the action is considered **automatically successful**, requiring no dice roll.

## 2. Design

### 2.1 Complete Formula

Judgment calculation proceeds in two phases:

**Phase 1: Raw Final Result**
```
rawFinalResult = diceTotal(2d6) + attrMod + skillLevel + equipBonus + partyBonus - condPenalty - nightPenalty
```

**Phase 2: Threshold Judgment**
Compare rawFinalResult against the threshold table to determine the outcome. Then calculate the stored value:
```
storedFinalResult = rawFinalResult - difficultyLC
```

storedFinalResult is used by subsequent systems (e.g., damage calculation) for intensity quantification — positive values indicate performance exceeding expectations, negative values indicate falling short.

### 2.2 absurdity→LC Mapping Table

| absurdity | difficultyLC | Description |
|-----------|--------------|-------------|
| 1 ~ 2     | 2            | Extremely easy; ≤2 auto-success, no roll required |
| 3 ~ 4     | 5            | Easy |
| 5 ~ 6     | 8            | Normal |
| 7 ~ 8     | 12           | Difficult |
| 9+        | 16           | Extremely difficult / absurd |

### 2.3 Modifier Sources

Calculation logic for each modifier:

- **Attribute Modifier (attributeModifier)**: `floor((attr - 10) / 2)`, where `attr` is the character's relevant attribute value.
- **Skill Bonus (skillBonus)**: `skill.level`, taken directly from the character's skill level.
- **Equipment Bonus (equipmentBonus)**: The sum of effect values from three equipment types: `weapon + armor + accessory`. See 2.6 for extraction details.
- **Party Bonus (partyBonus)**: The sum of combat ability of all **conscious** party members.
- **Conditions Penalty (conditionsPenalty)**: Takes the **maximum** (`Math.max`) of `dicePenalty` across all matching abnormal conditions — the most severe condition determines the penalty. See 2.7 for details.
- **Night Penalty (nightPenalty)**: Determined by underground level and the game clock. See 2.5 for details.

### 2.4 Outcome Mapping

| rawFinalResult | outcome          | Meaning |
|----------------|------------------|---------|
| ≥ 12           | critical_success | Critical success |
| ≥ 8            | success          | Success |
| ≥ 5            | partial_success  | Partial success |
| ≥ 0            | failure          | Failure |
| < 0            | critical_failure | Critical failure |

### 2.5 Night Penalty Table

The night penalty is jointly determined by **terrain** and the **game clock**:

| Condition | Penalty | Notes |
|-----------|---------|-------|
| Terrain = underground | 3 | Unconditional underground penalty |
| clock ≥ 20 or clock < 5 | 2 (base value) | Deep night period; if no light source, additional +2 |
| clock < 6 or clock ≥ 19 | 1 | Dusk/dawn period |
| Other (daytime) | 0 | No penalty |

Where: when the base value is 2 and the character has no light source, final penalty = base value + 2 = 4.

### 2.6 Equipment Effect Resolution

The equipment system produces over a dozen effect types; the judgment system only concerns itself with a subset:

| Effect Type | Handling |
|-------------|----------|
| damage_bonus | Counted in directBonus (direct portion of equipment bonus) |
| attribute_mod | Only STR and DEX type attribute modifications are counted |
| skill_bonus | Counted in skillBonus |
| light_source | Affects night penalty value (see 2.5) |
| hp / restore / vital / special | **Ignored**, excluded from the judgment formula |

### 2.7 Condition Penalty Aggregation

The system defines 15 abnormal conditions, each carrying a `dicePenalty` field. Aggregation rules:

- Iterate over all of the character's currently active conditions
- Take `Math.max(...dicePenalties)` — i.e., the **most severe condition wins**, no stacking
- Unrecognized abnormal conditions default to penalty = 1

Typical conditions include: poison, paralysis, stun, blindness, fear, silence, etc.

### 2.8 API Example

**Interface definitions:**
- `JudgeParams`: `{ absurdityLevel, difficultyLC, reason, relevantSkill, relevantAttribute }`
- `DiceResult`: `{ diceValues, total, attributeModifier, skillBonus, equipmentBonus, finalResult, outcome, conditionsPenalty, nightPenalty, partyBonus }`

**Call syntax:**
```ts
const result = JudgmentSystem.evaluate(params, character, sceneContext);
```

**Die value formatting example:**
```
"2d6: [4,5] +2(attr) +3(skill) +1(equip) -2(cond) = 13 vs DC8 → success"
```

### 2.9 Related Systems

The Judgment System does not operate in isolation; it has data dependencies and process coupling with the following systems:

| System | File | Interaction |
|--------|------|-------------|
| PM Engine | [PM Engine and Prompt System](PM-Engine-and-Prompt-System.md) | `evaluateAction()` calls LLM to obtain absurdity value |
| Item System | [Item System](Item-System.md) | Equipment effect resolution provides equipmentBonus |
| Party System | [Party System](Party-System.md) | Member combat ability is summed to provide partyBonus |
| Security System | [Security System](Security-System.md) | `crypto.getRandomValues` provides secure random dice rolls |
| Character System | [Character System](Character-System.md) | Attributes/skills/conditions provide attrMod, skillBonus, condPenalty |

## 3. Roadmap

We intend to integrate elemental damage and resistance effects into the final judgment formula, so that fire, frost, lightning, and other attributes are no longer mere labels but tactical variables that genuinely influence every dice roll. In parallel, we will liberate `sceneModifier` from hardcoding, having gameStore read environmental modifiers in real time, so that scene atmosphere concretely shapes character fate.

Building on this foundation, we will explore multi-player conflict judgment extensions — when multiple players intersect in time and space, the system should be able to perceive and adjudicate complex interaction scenarios such as `space_conflict` and `causal_conflict`, providing a fair and efficient resolution mechanism for the dramatic collisions of multiplayer play.
