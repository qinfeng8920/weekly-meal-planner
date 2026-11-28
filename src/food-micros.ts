import micros from './food-micros-v24.json';

export const foodMicros:Record<string,Record<string,number|null>>={...micros,
  pitaya:{iron:.3,magnesium:41,zinc:.3,folate:44,vitaminB12:0},
  bayberry:{iron:.4,magnesium:7,zinc:.1,folate:26,vitaminB12:0},
  cherrytomato:{iron:.4,magnesium:13,zinc:.2,folate:35,vitaminB12:0},
};
