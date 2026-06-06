import asyncio


class WorldUpdateBroadcaster:
    def __init__(self):
        self._subscribers: set[asyncio.Queue[str]] = set()

    def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=8)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    def publish(self, reason: str = "world_updated") -> None:
        dead_queues: list[asyncio.Queue[str]] = []
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(reason)
            except asyncio.QueueFull:
                dead_queues.append(queue)

        for queue in dead_queues:
            self.unsubscribe(queue)


world_update_broadcaster = WorldUpdateBroadcaster()