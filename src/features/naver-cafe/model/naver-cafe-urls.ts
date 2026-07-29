export interface NaverCafeBoardIds {
  cafeId: string;
  menuId: string;
}

const NUMERIC_ID_PATTERN = /^\d{1,20}$/;

export const isValidNaverCafeId = (value: string) =>
  NUMERIC_ID_PATTERN.test(value.trim());

export const extractNaverCafeBoardIds = (
  value?: string | null,
): NaverCafeBoardIds | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const feMatch = trimmed.match(/\/f-e\/cafes\/(\d+)\/menus\/(\d+)/i);
  if (feMatch?.[1] && feMatch?.[2]) {
    return { cafeId: feMatch[1], menuId: feMatch[2] };
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const cafeId =
      url.searchParams.get("clubid") ??
      url.searchParams.get("search.clubid") ??
      url.searchParams.get("cafeId");
    const menuId =
      url.searchParams.get("menuid") ??
      url.searchParams.get("search.menuid") ??
      url.searchParams.get("menuId");

    if (cafeId && menuId && isValidNaverCafeId(cafeId) && isValidNaverCafeId(menuId)) {
      return { cafeId, menuId };
    }
  } catch {
    return null;
  }

  return null;
};

export const buildNaverCafeBoardUrl = (cafeId: string, menuId: string) =>
  `https://cafe.naver.com/f-e/cafes/${cafeId}/menus/${menuId}`;

export const buildNaverCafeArticleUrl = (
  cafeId: string,
  menuId: string,
  articleId: number,
) => `https://cafe.naver.com/f-e/cafes/${cafeId}/articles/${articleId}?menuid=${menuId}`;
