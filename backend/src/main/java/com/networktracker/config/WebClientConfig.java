package com.networktracker.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.reactive.function.client.ServletOAuth2AuthorizedClientExchangeFilterFunction;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Objects;

/**
 * WebClient beans pre-configured with service-to-service OAuth2 authentication
 * (client-credentials flow via Keycloak) and base URLs for each downstream
 * FastAPI service.
 */
@Configuration
public class WebClientConfig {

    @Value("${networktracker.services.rag.url}")
    private String ragServiceUrl;

    @Value("${networktracker.services.forecast.url}")
    private String forecastServiceUrl;

    @Value("${networktracker.services.congestion.url}")
    private String congestionServiceUrl;

    @Bean
    public OAuth2AuthorizedClientManager authorizedClientManager(
            ClientRegistrationRepository clientRegistrationRepository,
            OAuth2AuthorizedClientService authorizedClientService) {

        OAuth2AuthorizedClientProvider authorizedClientProvider =
                OAuth2AuthorizedClientProviderBuilder.builder()
                        .clientCredentials()
                        .build();

        AuthorizedClientServiceOAuth2AuthorizedClientManager authorizedClientManager =
                new AuthorizedClientServiceOAuth2AuthorizedClientManager(
                        clientRegistrationRepository, authorizedClientService);
        authorizedClientManager.setAuthorizedClientProvider(authorizedClientProvider);

        return authorizedClientManager;
    }

    private WebClient createServiceWebClient(String baseUrl, OAuth2AuthorizedClientManager authorizedClientManager) {
        ServletOAuth2AuthorizedClientExchangeFilterFunction oauth2Client =
                new ServletOAuth2AuthorizedClientExchangeFilterFunction(authorizedClientManager);
        oauth2Client.setDefaultClientRegistrationId("internal-service");

        return WebClient.builder()
                .baseUrl(Objects.requireNonNull(baseUrl, "Service base URL must not be null"))
                .filter(oauth2Client)
                .build();
    }

    @Bean(name = "ragWebClient")
    public WebClient ragWebClient(OAuth2AuthorizedClientManager authorizedClientManager) {
        return createServiceWebClient(ragServiceUrl, authorizedClientManager);
    }

    @Bean(name = "forecastWebClient")
    public WebClient forecastWebClient(OAuth2AuthorizedClientManager authorizedClientManager) {
        return createServiceWebClient(forecastServiceUrl, authorizedClientManager);
    }

    @Bean(name = "congestionWebClient")
    public WebClient congestionWebClient(OAuth2AuthorizedClientManager authorizedClientManager) {
        return createServiceWebClient(congestionServiceUrl, authorizedClientManager);
    }
}
