import type { LocalizedText } from '../kit/constants';

export const ComputerUseKitId = {
  BuiltIn: 'computer-use',
} as const;
export type ComputerUseKitId = typeof ComputerUseKitId[keyof typeof ComputerUseKitId];

export const ComputerUseSkillId = {
  BuiltIn: 'computer-use',
} as const;
export type ComputerUseSkillId = typeof ComputerUseSkillId[keyof typeof ComputerUseSkillId];

export const ComputerUseKitBundle = {
  BuiltIn: 'https://ai.005656.xyz/runtime/wulu-computer-use-kit-bundle.zip',
} as const;
export type ComputerUseKitBundle =
  typeof ComputerUseKitBundle[keyof typeof ComputerUseKitBundle];

export const ComputerUseKitBundleIntegrity = {
  Sha256: '53e48ce834ea902aaa887f43ee150fcffd871a35310ed1186a1b04f845b79164',
  SizeBytes: 3496,
} as const;
export type ComputerUseKitBundleIntegrity =
  typeof ComputerUseKitBundleIntegrity[keyof typeof ComputerUseKitBundleIntegrity];

export const ComputerUseKitMetadata = {
  Name: {
    en: 'Computer Use',
    zh: '电脑操作',
  } satisfies LocalizedText,
  Description: {
    en: 'Control local Windows desktop applications with screenshots, accessibility text, clicks, typing, scrolling, and app launching. Available on Windows x64; click targets are resolved to element centers.',
    zh: '通过截图、可访问性文本、点击、输入、滚动和应用启动来操作本地 Windows 桌面应用。当前支持 Windows x64；点击目标会自动解析到元素中心。',
  } satisfies LocalizedText,
  SkillName: {
    en: 'Computer Use',
    zh: '电脑操作',
  } satisfies LocalizedText,
  SkillDescription: {
    en: 'Use WULU Computer Use tools to inspect and control Windows desktop applications.',
    zh: '使用 WULU 电脑操作工具检查和操作 Windows 桌面应用。',
  } satisfies LocalizedText,
} as const;
