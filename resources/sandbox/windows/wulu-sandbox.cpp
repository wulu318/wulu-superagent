#define UNICODE
#define _UNICODE
#include <windows.h>
#include <string>
#include <vector>

static void fail(const wchar_t* message) {
  DWORD code = GetLastError();
  wchar_t buffer[512]{};
  wsprintfW(buffer, L"wulu-sandbox: %s (%lu)\n", message, code);
  WriteConsoleW(GetStdHandle(STD_ERROR_HANDLE), buffer, lstrlenW(buffer), nullptr, nullptr);
  ExitProcess(126);
}

int wmain(int argc, wchar_t** argv) {
  if (argc < 5 || std::wstring(argv[1]) != L"--workspace") fail(L"usage: --workspace <dir> --deny-network -- <command>");
  int separator = 3;
  while (separator < argc && std::wstring(argv[separator]) != L"--") separator++;
  if (separator + 1 >= argc) fail(L"missing command");

  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY, &token)) fail(L"OpenProcessToken");
  HANDLE restricted = nullptr;
  if (!CreateRestrictedToken(token, DISABLE_MAX_PRIVILEGE, 0, nullptr, 0, nullptr, 0, nullptr, &restricted)) fail(L"CreateRestrictedToken");
  CloseHandle(token);

  std::wstring command;
  for (int i = separator + 1; i < argc; ++i) {
    if (!command.empty()) command += L" ";
    command += L"\"" + std::wstring(argv[i]) + L"\"";
  }
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  std::vector<wchar_t> commandLine(command.begin(), command.end());
  commandLine.push_back(L'\0');
  if (!CreateProcessAsUserW(restricted, nullptr, commandLine.data(), nullptr, nullptr, TRUE,
      CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, nullptr, argv[2], &startup, &process)) {
    CloseHandle(restricted);
    fail(L"CreateProcessAsUser");
  }
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (job) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits));
    AssignProcessToJobObject(job, process.hProcess);
  }
  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD exitCode = 1;
  GetExitCodeProcess(process.hProcess, &exitCode);
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  if (job) CloseHandle(job);
  CloseHandle(restricted);
  return static_cast<int>(exitCode);
}
