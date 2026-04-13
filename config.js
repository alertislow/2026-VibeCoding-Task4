export const CONFIG = {
  // 請修改以下三個變數，填入您的 API 憑證、試算表 ID、與管理員 Email 清單
  CLIENT_ID: '451309826937-gggpu4hmn624kvr8bb9b691glq1mk70u.apps.googleusercontent.com',
  SPREADSHEET_ID: '1eRswarWYPopCYhWlHvAyj10CoewUGTogrkB4trXQ1a4',
  ADMIN_EMAILS: ['ejiejicl3gj94@gmail.com'], // 在這裡寫死您的 Email（可輸入多個），以啟用對應的管理介面

  DISCOVERY_DOCS: [
    'https://sheets.googleapis.com/$discovery/rest?version=v4',
    'https://www.googleapis.com/discovery/v1/apis/oauth2/v2/rest'
  ],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',

  // 試算表各工作表寫入與讀取範圍設定 (請確認您的 Sheet 名稱正確)
  RANGES: {
    SETTINGS: 'Settings!A2:B',
    RESTAURANTS: 'Restaurants!A2:B',
    MENU: 'Menu!A2:E',
    ORDERS: 'Orders!A2:H'
  }
};
