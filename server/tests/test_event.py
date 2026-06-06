import httpx, asyncio

async def exercise_event_api():
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.post("http://localhost:8000/api/v1/auth/register", json={"username":"evt3","password":"x"})
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        r = await c.get("http://localhost:8000/api/v1/events/available?region=royal_plains", headers=h)
        events = r.json()
        print(f"Available: {len(events)}")
        for e in events[:3]:
            print(f"  [{e['level']}] {e['name']} claimed={e['is_claimed']}")

        if events:
            eid = events[0]['template_id']
            r = await c.post(f"http://localhost:8000/api/v1/events/{eid}/trigger", json={"plan_description":"test"}, headers=h)
            print(f"Trigger: {r.status_code} {r.json()}")

        print("OK")

if __name__ == "__main__":
    asyncio.run(exercise_event_api())
