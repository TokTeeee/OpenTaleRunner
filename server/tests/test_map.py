import httpx, asyncio

async def exercise_map_api():
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.get("http://localhost:8000/api/v1/world/map")
        pts = r.json()
        print(f"Map points: {len(pts)}")
        for p in pts[:5]:
            print(f"  {p['region']}: {p['terrain_type']} ({p['x_min']},{p['z_min']}) ~ ({p['x_max']},{p['z_max']})")

        r = await c.get("http://localhost:8000/api/v1/world/terrain?region=royal_plains&x=52000&y=0&z=47000")
        print(f"石板镇 terrain:", r.json())

        r = await c.get("http://localhost:8081/")
        print(f"Dashboard:", r.status_code)

        print("OK")

if __name__ == "__main__":
    asyncio.run(exercise_map_api())
