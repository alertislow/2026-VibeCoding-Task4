export const CONFIG = {
  // 請修改以下兩個變數，填入您的 API 憑證與試算表 ID
  CLIENT_ID: '451309826937-gggpu4hmn624kvr8bb9b691glq1mk70u.apps.googleusercontent.com',
  SPREADSHEET_ID: '1eRswarWYPopCYhWlHvAyj10CoewUGTogrkB4trXQ1a4',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

  // 試算表各工作表讀寫範圍設定 (請確認您的 Sheet 名稱正確)
  RANGES: {
    SETTINGS: 'Settings!A2:B',
    RESTAURANTS: 'Restaurants!A2:B',
    MENU: 'Menu!A2:E',
    ORDERS: 'Orders!A2:H'
  }
};
