import React from 'react';
import { Composition, Still } from 'remotion';
import { Manifesto, TOTAL } from './Manifesto';
import { PaperTex, Storybook, T } from './Storybook';
import { FPS } from './motion';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Manifesto" component={Manifesto} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    <Composition id="Storybook" component={Storybook} durationInFrames={T.total} fps={FPS} width={1080} height={1920} />
    {/* 종이 질감: npx remotion still src/index.ts PaperTex public/paper.png */}
    <Still id="PaperTex" component={PaperTex} width={1080} height={1920} />
  </>
);
