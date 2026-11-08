import React from 'react';
import { Composition, Still } from 'remotion';
import { Manifesto, TOTAL } from './Manifesto';
import { PaperTex, Storybook, T } from './Storybook';
import { Arcade } from './Arcade';
import { LeafBlanket } from './LeafBlanket';
import { OUTRO_FRAMES, ReelCover, ReelOutro } from './Reels';
import DEC from './arcade/dec.json';
import TL from './arcade/timeline.json';
import { FPS } from './motion';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Manifesto" component={Manifesto} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    <Composition id="Storybook" component={Storybook} durationInFrames={T.total} fps={FPS} width={1080} height={1920} />
    <Composition id="Arcade" component={Arcade} durationInFrames={TL.total} fps={FPS} width={1080} height={1920} />
    <Composition id="LeafBlanket" component={LeafBlanket} durationInFrames={DEC.total} fps={FPS} width={1080} height={1920} />
    {/* 릴스 포장: --props='{"ep":1}' 또는 2 */}
    <Still id="ReelCover" component={ReelCover} width={1080} height={1920} defaultProps={{ ep: 1 as const }} />
    <Composition id="ReelOutro" component={ReelOutro} durationInFrames={OUTRO_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{ ep: 1 as const }} />
    {/* 종이 질감: npx remotion still src/index.ts PaperTex public/paper.png */}
    <Still id="PaperTex" component={PaperTex} width={1080} height={1920} />
  </>
);
