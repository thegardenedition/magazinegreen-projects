import React from 'react';
import { Composition } from 'remotion';
import { Manifesto, TOTAL } from './Manifesto';
import { FPS } from './motion';

export const RemotionRoot: React.FC = () => (
  <Composition id="Manifesto" component={Manifesto} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
);
