import XCTest

final class WattelierUITests: XCTestCase {
    func testFirstLaunchWelcomeCardsLeadToConnection() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-welcome"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Votre énergie, enfin claire"].waitForExistence(timeout: 8))
        app.buttons["Suivant"].tap()
        XCTAssertTrue(app.staticTexts["Le direct, sans détour"].waitForExistence(timeout: 5))
        app.buttons["Suivant"].tap()
        XCTAssertTrue(app.staticTexts["Vos données restent chez vous"].waitForExistence(timeout: 5))
        app.buttons["Se connecter à mon serveur"].tap()
        XCTAssertTrue(app.staticTexts["Accéder à mon serveur"].waitForExistence(timeout: 5))
    }

    func testDemoNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-demo"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Aujourd’hui"].waitForExistence(timeout: 8))
        app.tabBars.buttons["Direct"].tap()
        XCTAssertTrue(app.navigationBars["Temps réel"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Appareils"].tap()
        XCTAssertTrue(app.navigationBars["Appareils"].waitForExistence(timeout: 5))
    }
}
