const NOTION_VERSION = "2026-03-11";

function plainText(richText = []) {
  return richText.map(item => item.plain_text || "").join("");
}

async function notionFetch(path) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Notion API 오류");
  }

  return data;
}

async function getAllChildren(blockId) {
  let results = [];
  let cursor;

  do {
    const query = new URLSearchParams({
      page_size: "100"
    });

    if (cursor) {
      query.set("start_cursor", cursor);
    }

    const data = await notionFetch(
      `/blocks/${blockId}/children?${query.toString()}`
    );

    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;

  } while (cursor);

  return results;
}

async function transformBlock(block) {
  const type = block.type;
  const value = block[type] || {};

  let result = {
    id: block.id,
    type
  };

  switch (type) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "quote":
    case "toggle":
      result.text = plainText(value.rich_text);
      break;

    case "to_do":
      result.text = plainText(value.rich_text);
      result.checked = value.checked || false;
      break;

    case "callout":
      result.text = plainText(value.rich_text);
      result.icon =
        value.icon?.emoji ||
        value.icon?.external?.url ||
        "";
      break;

    case "code":
      result.text = plainText(value.rich_text);
      result.language = value.language || "";
      break;

    case "image":
      result.url =
        value.type === "external"
          ? value.external?.url
          : value.file?.url;

      result.caption = plainText(value.caption);
      break;

    case "bookmark":
    case "link_preview":
      result.url = value.url || "";
      break;

    case "divider":
      break;

    case "table": {
      const rows = await getAllChildren(block.id);

      result.rows = rows
        .filter(row => row.type === "table_row")
        .map(row => ({
          cells: (row.table_row?.cells || []).map(cell =>
            plainText(cell)
          )
        }));

      result.has_column_header =
        value.has_column_header || false;

      result.has_row_header =
        value.has_row_header || false;

      return result;
    }

    default:
      result.text = "";
  }

  if (block.has_children && type !== "table") {
    const children = await getAllChildren(block.id);

    result.children = await Promise.all(
      children.map(transformBlock)
    );
  }

  return result;
}

function getPageTitle(page) {
  const properties = page.properties || {};

  for (const property of Object.values(properties)) {
    if (property.type === "title") {
      return plainText(property.title);
    }
  }

  return "";
}

export default {
  async fetch(request) {
    try {
      if (!process.env.NOTION_TOKEN) {
        return Response.json(
          {
            error: "NOTION_TOKEN이 설정되어 있지 않습니다."
          },
          { status: 500 }
        );
      }

      const url = new URL(request.url);
      const pageParam = url.searchParams.get("page");

      if (!pageParam) {
        return Response.json(
          {
            error: "page 값이 없습니다."
          },
          { status: 400 }
        );
      }

      const pageId = pageParam.replace(/-/g, "");

      const page = await notionFetch(
        `/pages/${pageId}`
      );

      const children = await getAllChildren(pageId);

      const blocks = await Promise.all(
        children.map(transformBlock)
      );

      return Response.json({
        title: getPageTitle(page),
        blocks
      });

    } catch (error) {
      console.error(error);

      return Response.json(
        {
          error: "노션 페이지를 불러오지 못했습니다.",
          details: error.message
        },
        { status: 500 }
      );
    }
  }
};
