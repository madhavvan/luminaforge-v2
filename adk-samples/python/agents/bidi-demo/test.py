import asyncio
import websockets

async def test():
    uri = 'wss://luminaforge-live-155418144770.us-south1.run.app/ws/demo-user/demo-session-z7z1qa'
    print(f'Connecting to {uri}...')
    try:
        async with websockets.connect(uri) as ws:
            print('Connected! Sending a ping to Gemini...')
            await ws.send('Hello from the terminal! Can you hear me?')
            response = await ws.recv()
            print(f'\nSUCCESS! Gemini replied: {response}')
    except Exception as e:
        print(f'\nFailed: {e}')

asyncio.run(test())
