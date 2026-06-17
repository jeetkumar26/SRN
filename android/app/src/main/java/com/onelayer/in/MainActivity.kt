package com.onelayer.`in`

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * Pure React Native CLI MainActivity.
 * All Expo module references (SplashScreenManager, ReactActivityDelegateWrapper,
 * expo.modules.*) have been removed.
 *
 * COMPONENT NAME FIX: getMainComponentName() returns "srn_mobile" which matches
 * the name registered in index.js: AppRegistry.registerComponent(appName, () => App)
 * where appName = "srn_mobile" from app.json.
 */
class MainActivity : ReactActivity() {

    /**
     * Must match app.json "name" field and the string passed to AppRegistry.registerComponent().
     * Previous bug: returned "main" instead of "srn_mobile" → caused blank screen on launch.
     */
    override fun getMainComponentName(): String = "srn_mobile"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
    }

    override fun invokeDefaultOnBackPressed() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
            if (!moveTaskToBack(false)) {
                super.invokeDefaultOnBackPressed()
            }
            return
        }
        super.invokeDefaultOnBackPressed()
    }
}
