import type { BeatData, ChapterData, MainQuestData, NarrativeGuide, RegionData, StartingContext, StoryBook, StoryKeyNPC, SubRegion } from '../../types/world';

function normalizeBeat(beat: BeatData): BeatData {
  return {
    ...beat,
    dependsOn: beat.dependsOn ?? beat.depends_on ?? null,
    unlockCondition: beat.unlockCondition ?? beat.unlock_condition,
    narrativeUnlock: beat.narrativeUnlock ?? beat.narrative_when_unlocked,
  };
}

function normalizeChapter(chapter: ChapterData): ChapterData {
  return {
    ...chapter,
    worldDayRange: chapter.worldDayRange ?? chapter.world_day_range,
    beats: (chapter.beats || []).map(normalizeBeat),
  };
}

function normalizeMainQuest(mainQuest?: MainQuestData): MainQuestData | undefined {
  if (!mainQuest) return undefined;

  const currentChapter = mainQuest.currentChapter ?? mainQuest.current_chapter;
  const currentChapterRange = currentChapter
    ? ('worldDayRange' in currentChapter
        ? currentChapter.worldDayRange
        : ('world_day_range' in currentChapter ? currentChapter.world_day_range : undefined))
    : undefined;

  return {
    ...mainQuest,
    currentChapter: currentChapter
      ? {
          ...currentChapter,
          worldDayRange: currentChapterRange,
        }
      : undefined,
    beats: (mainQuest.beats || []).map(normalizeBeat),
    chapters: (mainQuest.chapters || []).map(normalizeChapter),
    milestonesForNextChapter: mainQuest.milestonesForNextChapter ?? mainQuest.milestones_for_next_chapter,
  };
}

function normalizeNarrativeGuide(guide?: NarrativeGuide): NarrativeGuide | undefined {
  if (!guide) return undefined;
  return {
    ...guide,
    pointOfView: guide.pointOfView ?? guide.point_of_view,
    sceneLength: guide.sceneLength ?? guide.scene_length,
    choiceRules: guide.choiceRules ?? guide.choice_rules ?? [],
    consistencyChecks: guide.consistencyChecks ?? guide.consistency_checks ?? [],
  };
}

function normalizeBirthLocation(location: SubRegion): SubRegion {
  return {
    ...location,
    canBeBirthplace: location.canBeBirthplace ?? location.can_be_birthplace,
  };
}

function normalizeStartingContext(context?: StartingContext): StartingContext | undefined {
  if (!context) return undefined;
  const birthLocations = context.birthLocations ?? context.birth_locations ?? [];
  return {
    ...context,
    regionId: context.regionId ?? context.region_id ?? '',
    subRegion: context.subRegion ?? context.sub_region ?? '',
    birthLocations: birthLocations.map(normalizeBirthLocation),
  };
}

function normalizeKeyNPC(npc: StoryKeyNPC): StoryKeyNPC {
  return {
    ...npc,
    templateKey: npc.templateKey ?? npc.template_key,
  };
}

function normalizeRegion(region: RegionData): RegionData {
  const keyNPCs = region.keyNPCs ?? region.key_npcs ?? [];
  return {
    ...region,
    currentEvents: region.currentEvents ?? region.current_events ?? [],
    subRegions: region.subRegions ?? region.sub_regions?.map((sub) => sub.name) ?? [],
    sub_regions: region.sub_regions?.map(normalizeBirthLocation),
    keyNPCs: keyNPCs.map(normalizeKeyNPC),
    key_npcs: keyNPCs.map(normalizeKeyNPC),
  };
}

export function normalizeStoryBook(storyBook: StoryBook | null | undefined): StoryBook | null {
  if (!storyBook) return null;

  return {
    ...storyBook,
    worldName: storyBook.worldName ?? storyBook.world_name ?? '当前世界',
    currentEra: storyBook.currentEra ?? storyBook.current_era ?? '',
    worldLore: storyBook.worldLore ?? storyBook.world_lore ?? {},
    mainQuest: normalizeMainQuest(storyBook.mainQuest ?? storyBook.main_quest),
    narrativeGuide: normalizeNarrativeGuide(storyBook.narrativeGuide ?? storyBook.narrative_guide),
    startingContext: normalizeStartingContext(storyBook.startingContext ?? storyBook.starting_context),
    locationTypes: storyBook.locationTypes ?? storyBook.location_types ?? {},
    npcRoleTemplates: storyBook.npcRoleTemplates ?? storyBook.npc_role_templates ?? [],
    terrainSeeds: storyBook.terrainSeeds ?? storyBook.terrain_seeds ?? [],
    regions: (storyBook.regions || []).map(normalizeRegion),
  };
}