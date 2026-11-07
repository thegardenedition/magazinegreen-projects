import { Config } from '@remotion/cli/config';

// 이 작업 환경은 Chrome 내려받기가 막혀 있어 미리 설치된 headless shell 을 쓴다.
// 다른 PC 에서는 이 줄이 없어도 Remotion 이 알아서 받는다.
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
