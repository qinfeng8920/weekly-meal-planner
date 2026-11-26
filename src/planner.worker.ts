import {regenerate} from './planner';

self.onmessage=(event:MessageEvent<Parameters<typeof regenerate>>)=>{
  try {
    self.postMessage({plan:regenerate(...event.data)});
  } catch(error) {
    self.postMessage({error:error instanceof Error?error.message:'生成失败，请检查设置后重试。'});
  }
};
