import asyncio
import logging
logging.basicConfig(level=logging.DEBUG)
from app.deepgram import transcribe_audio

async def test():
    res = await transcribe_audio(b'a' * 1064960)
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(test())
