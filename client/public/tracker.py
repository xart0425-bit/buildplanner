import ctypes
import time
import os
import json
import urllib.request
import urllib.error
from datetime import datetime

# Sensitive keywords in window titles that should be masked for privacy
SENSITIVE_KEYWORDS = [
    "login", "signin", "로그인", "password", "passwd", "비밀번호", "비번",
    "bank", "은행", "pay", "페이", "계좌", "account", "kakaotalk", "카카오톡",
    "slack", "슬랙", "discord", "디스코드", "sensitive", "개인정보"
]

# Accumulator for activity tracking
# Key: (window_title, process_name, activity_type), Value: duration in seconds
activity_accumulator = {}

def get_active_window_details():
    """
    Retrieves the active window's title and process name using Windows ctypes APIs.
    """
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if not hwnd:
            return "Unknown Window", "unknown"

        # Get window title
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
        else:
            title = "Unknown Window"

        # Get process ID
        pid = ctypes.c_ulong()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

        # Get process name
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        h_process = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if h_process:
            buf = ctypes.create_unicode_buffer(1024)
            size = ctypes.c_ulong(1024)
            if ctypes.windll.kernel32.QueryFullProcessImageNameW(h_process, 0, buf, ctypes.byref(size)):
                process_path = buf.value
                process_name = os.path.basename(process_path)
            else:
                process_name = "unknown"
            ctypes.windll.kernel32.CloseHandle(h_process)
        else:
            process_name = "unknown"

        return title, process_name
    except Exception as e:
        # Fallback in case of any OS-level errors
        return "Unknown Window", "unknown"

def filter_sensitive_title(title, process_name):
    """
    Checks if the window title or process name contains sensitive keywords and masks it.
    """
    p_lower = process_name.lower()
    t_lower = title.lower()

    # Mask KakaoTalk specifically
    if "kakaotalk" in p_lower:
        return "카카오톡 메신저 (KakaoTalk Messenger)"

    # Mask other sensitive keywords
    for keyword in SENSITIVE_KEYWORDS:
        if keyword in t_lower or keyword in p_lower:
            return "민감한 작업 (Sensitive Activity)"

    return title

def classify_activity_type(process_name, title):
    """
    Categorizes the activity based on process name and window title.
    """
    p_lower = process_name.lower()
    t_lower = title.lower()

    # Coding tools
    if any(x in p_lower for x in ["code", "idea64", "pycharm", "clion", "devenv", "visualstudio", "sublime", "notepad++"]):
        return "coding"
    # Terminal
    if any(x in p_lower for x in ["cmd", "powershell", "wt", "bash", "conhost"]):
        return "terminal"
    # Design/Creative
    if any(x in p_lower for x in ["photoshop", "illustrator", "figma", "xd", "premiere"]):
        return "design"
    # Document / Office
    if any(x in p_lower for x in ["excel", "winword", "powerpnt", "hwp", "acrobat", "pdf"]):
        return "documentation"
    # Browsers
    if any(x in p_lower for x in ["chrome", "msedge", "firefox", "whale", "opera", "safari"]):
        if any(x in t_lower for x in ["github", "stackoverflow", "gitlab", "npm", "pip", "pypi", "docs", "developer"]):
            return "coding"
        if any(x in t_lower for x in ["google", "naver", "daum", "search", "검색"]):
            return "searching"
        return "browsing"
    # Communication
    if any(x in p_lower for x in ["slack", "discord", "teams", "zoom", "kakaotalk"]):
        return "communication"

    return "other"

def send_activities(activities):
    """
    Sends the aggregated activities to the local backend ingestion endpoint.
    """
    url = "http://localhost:3000/api/desktop/activities"
    headers = {"Content-Type": "application/json"}
    payload = json.dumps({"activities": activities}).encode("utf-8")
    
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            return True, res_body
    except urllib.error.URLError as e:
        return False, str(e)

def main():
    print("=" * 60)
    print("  BuildPlanner Windows Desktop Activity Tracker")
    print("  Status: Monitoring started (Checking every 5 seconds)")
    print("  Sensitive titles will be masked automatically for privacy.")
    print("=" * 60)

    last_send_time = time.time()
    
    while True:
        try:
            # 1. Get current active window
            raw_title, process_name = get_active_window_details()
            
            # Skip if window is idle / unknown/ lock screen etc.
            if process_name == "unknown" and raw_title == "Unknown Window":
                time.sleep(5)
                continue

            # 2. Filter sensitive titles
            title = filter_sensitive_title(raw_title, process_name)
            
            # 3. Classify activity type
            activity_type = classify_activity_type(process_name, title)
            
            # 4. Accumulate duration
            key = (title, process_name, activity_type)
            activity_accumulator[key] = activity_accumulator.get(key, 0) + 5
            
            # Print periodic status log
            now_str = datetime.now().strftime("%H:%M:%S")
            print(f"[{now_str}] Active: {process_name} | {title[:50]} ({activity_type})")

            # 5. Check if it's time to send (every 60 seconds)
            current_time = time.time()
            if current_time - last_send_time >= 60:
                if activity_accumulator:
                    # Convert accumulator to payload format
                    payload_list = []
                    for (t, p, act_t), dur in activity_accumulator.items():
                        payload_list.append({
                            "windowTitle": t,
                            "processName": p,
                            "duration": dur,
                            "activityType": act_t
                        })
                    
                    print(f"[{now_str}] Sending {len(payload_list)} activity records to backend...")
                    success, res_msg = send_activities(payload_list)
                    
                    if success:
                        print(f"[{now_str}] Transmission successful! Response: {res_msg}")
                        # Clear accumulator on success
                        activity_accumulator.clear()
                        last_send_time = current_time
                    else:
                        print(f"[{now_str}] Transmission failed: {res_msg}")
                        print(f"[{now_str}] Retaining data and retrying in the next cycle.")
                else:
                    last_send_time = current_time

            time.sleep(5)
        except KeyboardInterrupt:
            print("\nMonitoring stopped by user.")
            break
        except Exception as e:
            print(f"Unexpected error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
