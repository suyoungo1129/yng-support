export default async function handler(req, res) {
  try {
    const { page } = req.query;

    if (!page) {
      return res.status(400).json({
        error: "page 값이 없습니다."
      });
    }

    const token = process.env.NOTION_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "NOTION_TOKEN이 설정되어 있지 않습니다."
      });
    }

    const pageId = page.replace(/-/g, "");

    const response = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": "2026-03-11",
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Notion 페이지를 불러오지 못했습니다.",
        details: data
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "서버 오류가 발생했습니다.",
      details: error.message
    });
  }
}
