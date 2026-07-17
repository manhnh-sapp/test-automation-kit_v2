import { type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * BasePage gom các hành vi dùng chung cho mọi Page Object.
 * Team mới có thể thêm helper chung tại đây, nhưng không đặt assertion trong Page class.
 */
export class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Điều hướng tới URL hoặc route được truyền từ test/fixture. */
  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  /** Chờ trạng thái load ổn định bằng Playwright smart wait, không dùng hard sleep. */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
  }

  /** Đính kèm screenshot vào Playwright report để làm evidence khi cần. */
  async takeScreenshot(testInfo: TestInfo, name = 'page-state'): Promise<void> {
    const screenshot = await this.page.screenshot({ fullPage: true });
    await testInfo.attach(name, {
      body: screenshot,
      contentType: 'image/png',
    });
  }
}

/**
 * ExamplePage minh họa structure mong đợi:
 * - Locators khai báo readonly ở đầu class.
 * - Method mô tả hành vi người dùng, không đặt tên theo action DOM thô.
 * - Assertion để ở spec file, không để trong Page Object.
 */
export class ExamplePage extends BasePage {
  readonly pageHeading: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly primaryActionButton: Locator;
  readonly resultList: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole('heading', { name: /example|dashboard|home/i });
    this.searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/search|tìm kiếm/i));
    this.searchButton = page.getByRole('button', { name: /search|tìm kiếm/i });
    this.primaryActionButton = page.getByRole('button', { name: /create|add|new|tạo mới/i });
    this.resultList = page.getByRole('list').or(page.getByRole('table'));
  }

  /** Team customize route này theo màn hình thật của project. */
  async openModule(baseUrl: string, modulePath = '/'): Promise<void> {
    await this.navigate(new URL(modulePath, baseUrl).toString());
    await this.waitForLoad();
  }

  /** Hành vi nghiệp vụ: người dùng tìm kiếm theo keyword. */
  async searchByKeyword(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
    await this.searchButton.click();
    await this.waitForLoad();
  }

  /** Hành vi nghiệp vụ: người dùng bắt đầu flow tạo mới. */
  async startCreateFlow(): Promise<void> {
    await this.primaryActionButton.click();
    await this.waitForLoad();
  }
}
