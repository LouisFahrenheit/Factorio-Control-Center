export interface CommandDef {
  id: string;
  name: string;
  command: string;
  description: string;
  has_player?: boolean;
  has_value?: boolean;
  has_boolean?: boolean;
  has_item?: boolean;
  has_count?: boolean;
  has_quality?: boolean;
  default_value?: string;
  default_quality?: string;
  items?: Record<string, number>;
  requires_value?: boolean;
}

export interface CommandCategoryDef {
  name: string;
  commands: CommandDef[];
}

export interface CommandsCatalogDoc {
  version: string;
  categories: Record<string, CommandCategoryDef>;
}

export interface CommandEditorState {
  catalog: CommandsCatalogDoc;
  selectedCategoryKey: string;
  selectedCommandId: string;
}
