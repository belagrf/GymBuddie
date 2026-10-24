import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    // index.html, stale bookmarks, and offline navigations served by the service worker's
    // app-shell fallback would otherwise render an empty page.
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
})

export default router
