# 语义路由定义——8 个类别的 Route 和 utterances（中英文混合）
from __future__ import annotations

from semantic_router import Route

ROUTE_MODEL_MAP: dict[str, str] = {
    "code_tasks": "deepseek/deepseek-coder-v3",
    "data_analysis": "openai/gpt-4o",
    "content_creation": "anthropic/claude-3-5-sonnet",
    "daily_chat": "deepseek/deepseek-chat",
    "translation": "deepseek/deepseek-chat",
    "math_reasoning": "openai/gpt-4o",
    "long_document": "anthropic/claude-3-5-sonnet",
    "other": "deepseek/deepseek-chat",
}

code_tasks = Route(
    name="code_tasks",
    utterances=[
        "写一个快速排序",
        "debug this function",
        "帮我写Python代码",
        "implement a REST API",
        "写一个爬虫脚本",
        "fix the bug in this code",
        "帮我优化这段SQL查询",
        "create a React component",
        "用TypeScript实现一个工具函数",
        "explain this algorithm implementation",
        "帮我写单元测试",
        "refactor this class",
        "写一个Docker配置文件",
        "how to use async/await in Python",
        "帮我写一个正则表达式",
        "这段代码的时间复杂度是多少",
        "请用伪代码描述该算法",
    ],
)

data_analysis = Route(
    name="data_analysis",
    utterances=[
        "分析这份销售数据",
        "create a visualization of this dataset",
        "帮我做数据清洗",
        "run a statistical analysis",
        "用pandas处理这个CSV文件",
        "build a machine learning model",
        "帮我画一个数据趋势图",
        "calculate the correlation between these variables",
        "做一个回归分析",
        "analyze the distribution of this data",
        "帮我做A/B测试分析",
        "数据预处理和特征工程",
        "用matplotlib画图",
        "帮我写一个数据报告",
        "这份表格里的异常值怎么找",
        "请解释相关系数和p值",
    ],
)

content_creation = Route(
    name="content_creation",
    utterances=[
        "帮我写一篇博客文章",
        "write a marketing copy",
        "帮我写产品描述",
        "create a social media post",
        "帮我写一封商务邮件",
        "draft a press release",
        "写一篇技术文档",
        "帮我润色这段文字",
        "write a creative story",
        "帮我写演讲稿",
        "create a newsletter",
        "帮我写项目提案",
        "写一篇SEO优化的文章",
        "帮我写产品评测",
    ],
)

daily_chat = Route(
    name="daily_chat",
    utterances=[
        "今天天气怎么样",
        "what should I have for dinner",
        "给我推荐一部电影",
        "tell me a joke",
        "你好，最近怎么样",
        "what's the meaning of life",
        "帮我想一个生日礼物",
        "recommend a good book",
        "周末去哪里玩好",
        "can you chat with me",
        "给我讲个故事",
        "what do you think about AI",
        "帮我做个决定",
        "你有什么有趣的事情分享吗",
    ],
)

translation = Route(
    name="translation",
    utterances=[
        "把这段话翻译成英文",
        "translate this to Chinese",
        "帮我翻译这个文档",
        "what does this French text mean",
        "翻译成日语",
        "translate this email to Spanish",
        "帮我把这篇论文翻译成中文",
        "how do you say this in German",
        "英译中这段话",
        "translate this technical document",
        "帮我翻译这段对话",
        "把这个翻译成韩语",
        "localize this UI text",
        "帮我做中英文对照翻译",
    ],
)

math_reasoning = Route(
    name="math_reasoning",
    utterances=[
        "解这个方程",
        "prove this theorem",
        "帮我做微积分",
        "solve this optimization problem",
        "算一下这个概率",
        "explain this mathematical concept",
        "帮我推导这个公式",
        "what's the integral of this function",
        "解这道数学题",
        "help me with linear algebra",
        "帮我做数值计算",
        "prove by induction",
        "这道逻辑推理题怎么做",
        "calculate the eigenvalues",
    ],
)

long_document = Route(
    name="long_document",
    utterances=[
        "总结这篇长文章",
        "summarize this research paper",
        "帮我分析这份合同",
        "read through this document and extract key points",
        "帮我整理这份会议记录",
        "analyze this lengthy report",
        "把这本书的要点总结一下",
        "review this legal document",
        "帮我提取这篇论文的关键发现",
        "compare these two long documents",
        "帮我做文献综述",
        "整理这份调研报告",
        "summarize the main arguments",
        "帮我概括这份技术白皮书",
    ],
)

other_route = Route(
    name="other",
    utterances=[
        "帮我做个计划",
        "what's your opinion on this",
        "给我一些建议",
        "how does this work",
        "帮我想想办法",
        "explain this concept",
        "我该怎么处理这个问题",
        "what are the pros and cons",
        "帮我做SWOT分析",
        "compare these options",
        "帮我做头脑风暴",
        "what's the best approach",
        "帮我列个清单",
        "give me some ideas",
    ],
)

ALL_ROUTES: list[Route] = [
    code_tasks,
    data_analysis,
    content_creation,
    daily_chat,
    translation,
    math_reasoning,
    long_document,
    other_route,
]


def get_target_model(route_name: str | None) -> str | None:
    """根据路由名称返回目标模型，未知路由返回 None。"""
    if route_name is None:
        return None
    return ROUTE_MODEL_MAP.get(route_name)
