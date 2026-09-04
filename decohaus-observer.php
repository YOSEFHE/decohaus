<?php
/**
 * Plugin Name: DecoHaus Observer
 * Description: Read-only, privacy-safe status endpoint for automated DecoHaus QA. No write access and no secrets are exposed.
 * Version: 1.0.0
 * Author: DecoHaus
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

if (!defined('ABSPATH')) {
    exit;
}

final class DecoHaus_Observer {
    const VERSION = '1.0.0';
    const ROUTE_NAMESPACE = 'decohaus-observer/v1';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        register_rest_route(self::ROUTE_NAMESPACE, '/snapshot', [
            'methods'  => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'snapshot'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function snapshot(WP_REST_Request $request): WP_REST_Response {
        $data = [
            'schema_version' => '1.0',
            'generated_at_utc' => gmdate('c'),
            'privacy' => [
                'mode' => 'public-read-only',
                'contains_secrets' => false,
                'contains_user_accounts' => false,
                'contains_unpublished_content' => false,
            ],
            'site' => self::site_data(),
            'routes' => self::route_data(),
            'menus' => self::menu_data(),
            'pages' => self::page_data(),
            'projects' => self::project_data(),
            'content_types' => self::content_type_data(),
        ];

        $response = new WP_REST_Response($data, 200);
        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $response->header('Pragma', 'no-cache');
        $response->header('X-Robots-Tag', 'noindex, nofollow, noarchive');
        $response->header('Referrer-Policy', 'no-referrer');
        $response->header('X-Content-Type-Options', 'nosniff');
        return $response;
    }

    private static function site_data(): array {
        $front_page_id = (int) get_option('page_on_front');
        return [
            'name' => (string) get_bloginfo('name'),
            'description' => (string) get_bloginfo('description'),
            'home_url' => home_url('/'),
            'language' => (string) get_bloginfo('language'),
            'text_direction' => is_rtl() ? 'rtl' : 'ltr',
            'search_engine_visibility' => ((int) get_option('blog_public') === 1) ? 'indexable' : 'discouraged',
            'front_page' => $front_page_id ? [
                'id' => $front_page_id,
                'title' => get_the_title($front_page_id),
                'url' => get_permalink($front_page_id),
            ] : null,
            'permalink_structure' => (string) get_option('permalink_structure'),
        ];
    }

    private static function route_data(): array {
        return [
            'home' => home_url('/'),
            'fa' => home_url('/fa/'),
            'en' => home_url('/en/'),
            'robots' => home_url('/robots.txt'),
            'wordpress_sitemap' => home_url('/wp-sitemap.xml'),
            'image_sitemap' => home_url('/sitemap-images.xml'),
            'observer' => rest_url(self::ROUTE_NAMESPACE . '/snapshot'),
        ];
    }

    private static function menu_data(): array {
        $output = [];
        $locations = get_nav_menu_locations();
        foreach ($locations as $location => $menu_id) {
            $items = wp_get_nav_menu_items($menu_id);
            if (!$items || is_wp_error($items)) {
                continue;
            }
            $output[$location] = array_map(static function ($item): array {
                return [
                    'title' => wp_strip_all_tags((string) $item->title),
                    'url' => esc_url_raw((string) $item->url),
                    'parent' => (int) $item->menu_item_parent,
                    'order' => (int) $item->menu_order,
                ];
            }, $items);
        }
        return $output;
    }

    private static function page_data(): array {
        $pages = get_posts([
            'post_type' => 'page',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'orderby' => ['menu_order' => 'ASC', 'title' => 'ASC'],
            'no_found_rows' => true,
        ]);

        return array_map(static function (WP_Post $post): array {
            return [
                'id' => $post->ID,
                'title' => get_the_title($post),
                'slug' => $post->post_name,
                'url' => get_permalink($post),
                'modified_gmt' => get_post_modified_time('c', true, $post),
                'excerpt' => self::clean_text(has_excerpt($post) ? get_the_excerpt($post) : wp_trim_words(wp_strip_all_tags($post->post_content), 45, '…'), 1200),
                'featured_image' => self::featured_image($post->ID),
            ];
        }, $pages);
    }

    private static function project_data(): array {
        $types = self::project_post_types();
        $projects = [];

        foreach ($types as $post_type) {
            $posts = get_posts([
                'post_type' => $post_type,
                'post_status' => 'publish',
                'posts_per_page' => -1,
                'orderby' => ['menu_order' => 'ASC', 'title' => 'ASC'],
                'no_found_rows' => true,
            ]);

            foreach ($posts as $post) {
                $projects[] = [
                    'id' => $post->ID,
                    'post_type' => $post_type,
                    'title' => get_the_title($post),
                    'slug' => $post->post_name,
                    'url' => get_permalink($post),
                    'modified_gmt' => get_post_modified_time('c', true, $post),
                    'excerpt' => self::clean_text(has_excerpt($post) ? get_the_excerpt($post) : wp_trim_words(wp_strip_all_tags($post->post_content), 70, '…'), 1800),
                    'content_text' => self::clean_text(wp_strip_all_tags($post->post_content), 7000),
                    'featured_image' => self::featured_image($post->ID),
                    'safe_meta' => self::safe_project_meta($post->ID),
                ];
            }
        }

        return $projects;
    }

    private static function content_type_data(): array {
        $objects = get_post_types(['public' => true], 'objects');
        $excluded = ['attachment', 'revision', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'];
        $result = [];
        foreach ($objects as $name => $object) {
            if (in_array($name, $excluded, true)) {
                continue;
            }
            $counts = wp_count_posts($name);
            $result[$name] = [
                'label' => wp_strip_all_tags((string) $object->label),
                'published' => isset($counts->publish) ? (int) $counts->publish : 0,
                'archive' => $object->has_archive ? get_post_type_archive_link($name) : null,
            ];
        }
        return $result;
    }

    private static function project_post_types(): array {
        $objects = get_post_types(['public' => true], 'objects');
        $matches = [];
        foreach ($objects as $name => $object) {
            if (in_array($name, ['post', 'page', 'attachment'], true)) {
                continue;
            }
            $haystack = strtolower($name . ' ' . (string) $object->label . ' ' . (string) $object->labels->singular_name);
            if (
                str_contains($haystack, 'project') ||
                str_contains($haystack, 'decohaus') ||
                str_contains($haystack, 'پروژه')
            ) {
                $matches[] = $name;
            }
        }
        foreach (['decohaus_project', 'project', 'projects'] as $preferred) {
            if (post_type_exists($preferred) && !in_array($preferred, $matches, true)) {
                $matches[] = $preferred;
            }
        }
        return array_values(array_unique($matches));
    }

    private static function safe_project_meta(int $post_id): array {
        $all = get_post_meta($post_id);
        $out = [];
        $allowed_tokens = [
            'lang', 'language', 'location', 'year', 'date', 'area', 'floor',
            'typology', 'use', 'role', 'scope', 'summary', 'challenge', 'solution',
            'outcome', 'gallery', 'seo', 'description', 'og', 'pair', 'related',
            'order', 'featured', 'hero', 'image', 'project'
        ];

        foreach ($all as $key => $values) {
            if ($key === '' || str_starts_with($key, '_')) {
                continue;
            }
            $lower = strtolower($key);
            $allowed = false;
            foreach ($allowed_tokens as $token) {
                if (str_contains($lower, $token)) {
                    $allowed = true;
                    break;
                }
            }
            if (!$allowed) {
                continue;
            }

            $normalized = [];
            foreach ((array) $values as $value) {
                $value = maybe_unserialize($value);
                $normalized[] = self::normalize_meta_value($value, $lower);
            }
            $out[$key] = count($normalized) === 1 ? $normalized[0] : $normalized;
        }
        return $out;
    }

    private static function normalize_meta_value($value, string $key) {
        if (is_array($value)) {
            $out = [];
            foreach ($value as $k => $v) {
                $out[$k] = self::normalize_meta_value($v, $key);
            }
            return $out;
        }
        if (is_object($value)) {
            return self::normalize_meta_value((array) $value, $key);
        }
        if (is_bool($value) || is_null($value)) {
            return $value;
        }

        $is_image_key = str_contains($key, 'image') || str_contains($key, 'gallery') || str_contains($key, 'hero') || str_contains($key, 'og');
        if ($is_image_key && (is_int($value) || (is_string($value) && ctype_digit($value)))) {
            $attachment_id = (int) $value;
            if ($attachment_id > 0 && get_post_type($attachment_id) === 'attachment') {
                return self::attachment_data($attachment_id);
            }
        }

        if (is_numeric($value)) {
            return (string) $value;
        }
        return self::clean_text((string) $value, 5000);
    }

    private static function featured_image(int $post_id): ?array {
        $id = get_post_thumbnail_id($post_id);
        return $id ? self::attachment_data($id) : null;
    }

    private static function attachment_data(int $id): array {
        $full = wp_get_attachment_image_src($id, 'full');
        $large = wp_get_attachment_image_src($id, 'large');
        return [
            'id' => $id,
            'url' => $full ? esc_url_raw($full[0]) : null,
            'large_url' => $large ? esc_url_raw($large[0]) : null,
            'alt' => self::clean_text((string) get_post_meta($id, '_wp_attachment_image_alt', true), 1000),
            'caption' => self::clean_text((string) wp_get_attachment_caption($id), 1200),
        ];
    }

    private static function clean_text(string $text, int $max_length): string {
        $text = html_entity_decode(wp_strip_all_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\s+/u', ' ', $text) ?: '';
        $text = trim($text);
        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $max_length);
        }
        return substr($text, 0, $max_length);
    }
}

DecoHaus_Observer::init();
