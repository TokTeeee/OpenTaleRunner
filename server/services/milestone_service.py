"""里程碑服务"""
from repositories.world_repo import IWorldRepo


class MilestoneService:
    def __init__(self, world_repo: IWorldRepo):
        self.world_repo = world_repo

    async def add_contribution(self, milestone_id: str, amount: int) -> None:
        pass

    async def check_and_unlock(self) -> list[dict]:
        return []
