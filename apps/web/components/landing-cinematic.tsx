'use client';

// Replaced landing cinematic with the newer HeroSequence-based implementation
import { HeroSequence } from './hero-sequence';

export default function LandingCinematic() {
  return <HeroSequence totalFrames={240} fps={30} path="/hero-frames" />;
}
