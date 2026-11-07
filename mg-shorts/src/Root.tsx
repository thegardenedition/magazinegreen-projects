import React from 'react';
import { Composition, Still } from 'remotion';
import { Manifesto, TOTAL } from './Manifesto';
import { PaperTex, Storybook, T } from './Storybook';
import { Arcade } from './Arcade';
import { LeafBlanket } from './LeafBlanket';
import DEC from './arcade/dec.json';
import TL from './arcade/timeline.json';
import { FPS } from './motion';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Manifesto" component={Manifesto} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    <Composition id="Storybook" component={Storybook} durationInFrames={T.total} fps={FPS} width={1080} height={1920} />
    <Composition id="Arcade" component={Arcade} durationInFrames={TL.total} fps={FPS} width={1080} height={1920} />
    <Composition id="LeafBlanket" component={LeafBlanket} durationInFrames={DEC.total} fps={FPS} width={1080} height={1920} />
    {/* 종이 질감: npx remotion still src/index.ts PaperTex public/paper.png */}
    <Still id="PaperTex" component={PaperTex} width={1080} height={1920} />
  </>
);
