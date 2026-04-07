@echo off
chcp 65001 >nul

REM 切换到项目根目录（scripts 的上级）
cd /d "%~dp0.."

echo ========================================
echo   LangGraph 智能报销助手 - 快速启动
echo ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo [1/6] 检查Python版本...
python --version

if not exist ".venv" (
    echo.
    echo [2/6] 创建虚拟环境...
    python -m venv .venv
    if errorlevel 1 ( echo [错误] 虚拟环境创建失败 & pause & exit /b 1 )
    echo [成功] 虚拟环境已创建
) else (
    echo [2/6] 虚拟环境已存在，跳过创建
)

echo.
echo [3/6] 激活虚拟环境...
call .venv\Scripts\activate.bat
if errorlevel 1 ( echo [错误] 虚拟环境激活失败 & pause & exit /b 1 )

echo.
echo [4/6] 安装依赖...
pip install -r requirements.txt -q

echo.
echo [5/6] 检查环境变量配置...
if not exist ".env" (
    copy .env.example .env >nul
    echo [提示] 已从模板创建 .env，请填入豆包API密钥后按任意键继续...
    notepad .env
    pause >nul
)

echo.
echo [6/6] 生成gRPC代码...
if not exist "src\generated\graph_service_pb2.py" (
    call scripts\generate_proto.bat
    if errorlevel 1 ( echo [错误] gRPC代码生成失败 & pause & exit /b 1 )
) else (
    echo [跳过] gRPC代码已存在
)

echo.
echo ========================================
echo   准备就绪，启动服务...
echo ========================================
echo [提示] 按 Ctrl+C 可停止服务
echo.
timeout /t 2 >nul

python main.py
pause
