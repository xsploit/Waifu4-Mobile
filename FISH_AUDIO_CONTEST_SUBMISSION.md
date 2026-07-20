# Fish Audio Builder Contest Submission

**Project name:**  
WebWaifu 4

**Short description:**  
WebWaifu 4 is an open-source AI companion and VTuber co-host with a fully animated VRM avatar, streamed LLM responses, persistent memory, Twitch chat, and Discord collaboration voice. Fish Audio gives the character her real-time voice and drives audio-reactive lip sync while she speaks.

**Demo / repo / video link:**  
Demo video: [PASTE VIDEO LINK]  
Repository: https://github.com/xsploit/waifu4

**Fish Audio feature or API used:**  
Fish Audio real-time WebSocket TTS, streaming Timestamp SSE, S2 Pro voices, voice model selection, PCM streaming, and speech timing metadata.

**What makes it useful, creative, or technically interesting:**  
Fish Audio is part of the live interaction pipeline rather than a single TTS call. LLM text is streamed into Fish Audio as soon as speakable text becomes available, allowing the character to begin talking without waiting for the full response.

The returned PCM audio plays immediately in the browser or Electron app and simultaneously drives the VRM avatar's wLipSync mouth animation. Fish timestamp metadata can also support synchronized captions and mouth timing.

WebWaifu 4 includes multiple Fish transport modes, adjustable latency, chunking, continuity, sample rate, voice selection, browser playback controls, and an audible benchmark for comparing WebSocket and Timestamp SSE performance. It can respond to local chat, Twitch IRC, or Discord voice participants while preserving the same avatar, voice, emotion, and memory pipeline.

**Fish Audio account email for rewards:**  
borohead420@gmail.com
